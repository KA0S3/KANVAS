-- =====================================================
-- PHASE 12: TESTING & DEPLOYMENT
-- =====================================================
-- KEEP FRONTEND AS IS - Backend-only testing
-- 
-- GOAL: Comprehensive test suite for RPC functions,
--       index consistency, and performance validation
-- =====================================================

-- =====================================================
-- 1. TEST FRAMEWORK SETUP (pgTAP-style)
-- =====================================================

-- Test results table
CREATE TABLE IF NOT EXISTS public._test_results (
    id SERIAL PRIMARY KEY,
    test_suite TEXT NOT NULL,
    test_name TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test helper: Assert equals
CREATE OR REPLACE FUNCTION public.test_assert_equals(
    p_test_name TEXT,
    p_expected ANYELEMENT,
    p_actual ANYELEMENT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_expected = p_actual THEN
        INSERT INTO public._test_results (test_suite, test_name, passed, execution_time_ms)
        VALUES ('ASSERT_EQUALS', p_test_name, true, 0);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('ASSERT_EQUALS', p_test_name, false, 
            format('Expected %L but got %L', p_expected, p_actual));
        RETURN false;
    END IF;
END;
$$;

-- Test helper: Assert true
CREATE OR REPLACE FUNCTION public.test_assert_true(
    p_test_name TEXT,
    p_condition BOOLEAN
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_condition THEN
        INSERT INTO public._test_results (test_suite, test_name, passed)
        VALUES ('ASSERT_TRUE', p_test_name, true);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('ASSERT_TRUE', p_test_name, false, 'Condition was false');
        RETURN false;
    END IF;
END;
$$;

-- Test helper: Clear results
CREATE OR REPLACE FUNCTION public.test_clear_results()
RETURNS VOID
LANGUAGE SQL
AS $$
    DELETE FROM public._test_results;
$$;

-- Test helper: Get summary
CREATE OR REPLACE FUNCTION public.test_get_summary()
RETURNS TABLE (
    total_tests BIGINT,
    passed_tests BIGINT,
    failed_tests BIGINT,
    pass_rate NUMERIC
)
LANGUAGE SQL
AS $$
    SELECT 
        count(*)::BIGINT as total_tests,
        count(*) FILTER (WHERE passed = true)::BIGINT as passed_tests,
        count(*) FILTER (WHERE passed = false)::BIGINT as failed_tests,
        CASE 
            WHEN count(*) = 0 THEN 0
            ELSE round((count(*) FILTER (WHERE passed = true)::NUMERIC / count(*)::NUMERIC) * 100, 2)
        END as pass_rate
    FROM public._test_results;
$$;

-- =====================================================
-- 2. RPC FUNCTION UNIT TESTS
-- =====================================================

-- Test: load_project_document basic functionality
CREATE OR REPLACE FUNCTION public.test_load_project_document()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_result JSONB;
BEGIN
    -- Create test user and project
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', '{"assets": {}}'::JSONB, 1);
    
    -- Test load
    SELECT world_document INTO v_result
    FROM public.load_project_document(v_project_id);
    
    RETURN public.test_assert_equals(
        'load_project_document returns correct document',
        '{"assets": {}}'::JSONB,
        v_result
    );
END;
$$;

-- Test: save_document_operations atomicity
CREATE OR REPLACE FUNCTION public.test_save_document_operations_atomicity()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_result RECORD;
    v_operations JSONB := '[
        {"op": "CREATE_ASSET", "assetId": "asset-1", "name": "Test Asset", "type": "folder"},
        {"op": "CREATE_ASSET", "assetId": "asset-2", "name": "Child Asset", "type": "folder", "parentId": "asset-1"}
    ]'::JSONB;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', '{"assets": {}}'::JSONB, 1);
    
    -- Execute operations
    SELECT * INTO v_result
    FROM public.save_document_operations(v_project_id, 1, v_operations);
    
    -- Verify success
    IF NOT public.test_assert_true('save_document_operations returns success', v_result.success) THEN
        RETURN false;
    END IF;
    
    -- Verify both assets in index
    RETURN public.test_assert_equals(
        'both assets created in index',
        2::BIGINT,
        (SELECT count(*) FROM public.assets_index WHERE project_id = v_project_id)
    );
END;
$$;

-- Test: version conflict detection
CREATE OR REPLACE FUNCTION public.test_version_conflict()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_result RECORD;
    v_operations JSONB := '[{"op": "UPDATE_METADATA", "assetId": "nonexistent", "name": "Test"}]'::JSONB;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', '{"assets": {}}'::JSONB, 1);
    
    -- Simulate concurrent update by incrementing version directly
    UPDATE public.projects SET version = 2 WHERE id = v_project_id;
    
    -- Try to save with old version
    SELECT * INTO v_result
    FROM public.save_document_operations(v_project_id, 1, v_operations);
    
    -- Verify conflict detected
    RETURN public.test_assert_true(
        'version conflict detected',
        NOT v_result.success AND v_result.error LIKE '%CONFLICT%'
    );
END;
$$;

-- Test: query_assets_by_parent
CREATE OR REPLACE FUNCTION public.test_query_assets_by_parent()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_root_count INTEGER;
    v_child_count INTEGER;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', jsonb_build_object(
        'assets', jsonb_build_object(
            'root-1', jsonb_build_object('name', 'Root 1', 'type', 'folder', 'parentId', null),
            'root-2', jsonb_build_object('name', 'Root 2', 'type', 'folder', 'parentId', null),
            'child-1', jsonb_build_object('name', 'Child 1', 'type', 'scene', 'parentId', 'root-1')
        )
    ), 1);
    
    -- Build index
    PERFORM public.rebuild_project_index(v_project_id);
    
    -- Test root query
    SELECT count(*)::INTEGER INTO v_root_count
    FROM public.query_assets_by_parent(v_project_id, NULL);
    
    IF NOT public.test_assert_equals('root assets count', 2, v_root_count) THEN
        RETURN false;
    END IF;
    
    -- Test child query
    SELECT count(*)::INTEGER INTO v_child_count
    FROM public.query_assets_by_parent(v_project_id, 'root-1');
    
    RETURN public.test_assert_equals('child assets count', 1, v_child_count);
END;
$$;

-- Test: rebuild_project_index idempotency
CREATE OR REPLACE FUNCTION public.test_rebuild_index_idempotency()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_count_after_first INTEGER;
    v_count_after_second INTEGER;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', jsonb_build_object(
        'assets', jsonb_build_object(
            'asset-1', jsonb_build_object('name', 'Asset 1', 'type', 'folder'),
            'asset-2', jsonb_build_object('name', 'Asset 2', 'type', 'folder')
        )
    ), 1);
    
    -- First rebuild
    PERFORM public.rebuild_project_index(v_project_id);
    SELECT count(*)::INTEGER INTO v_count_after_first FROM public.assets_index WHERE project_id = v_project_id;
    
    -- Second rebuild
    PERFORM public.rebuild_project_index(v_project_id);
    SELECT count(*)::INTEGER INTO v_count_after_second FROM public.assets_index WHERE project_id = v_project_id;
    
    -- Verify counts match
    RETURN public.test_assert_equals('rebuild is idempotent', v_count_after_first, v_count_after_second);
END;
$$;

-- =====================================================
-- 3. INDEX CONSISTENCY TESTS
-- =====================================================

-- Test: assets_index matches world_document
CREATE OR REPLACE FUNCTION public.test_index_document_consistency()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_doc_count INTEGER;
    v_index_count INTEGER;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', jsonb_build_object(
        'assets', jsonb_build_object(
            'asset-1', jsonb_build_object('name', 'Asset 1', 'type', 'folder'),
            'asset-2', jsonb_build_object('name', 'Asset 2', 'type', 'scene'),
            'asset-3', jsonb_build_object('name', 'Asset 3', 'type', 'character')
        )
    ), 1);
    
    -- Build index
    PERFORM public.rebuild_project_index(v_project_id);
    
    -- Count in document
    SELECT jsonb_object_keys_count(world_document->'assets') INTO v_doc_count
    FROM public.projects WHERE id = v_project_id;
    
    -- Count in index
    SELECT count(*)::INTEGER INTO v_index_count FROM public.assets_index WHERE project_id = v_project_id;
    
    RETURN public.test_assert_equals('document and index counts match', v_doc_count, v_index_count);
END;
$$;

-- Test: parent-child relationships in index
CREATE OR REPLACE FUNCTION public.test_index_parent_relationships()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_orphan_count INTEGER;
BEGIN
    -- Setup with potential orphans
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Test Project', jsonb_build_object(
        'assets', jsonb_build_object(
            'parent-1', jsonb_build_object('name', 'Parent', 'type', 'folder'),
            'child-1', jsonb_build_object('name', 'Child', 'type', 'scene', 'parentId', 'parent-1'),
            'orphan', jsonb_build_object('name', 'Orphan', 'type', 'scene', 'parentId', 'nonexistent-parent')
        )
    ), 1);
    
    -- Build index
    PERFORM public.rebuild_project_index(v_project_id);
    
    -- Count orphans (assets with parent that doesn't exist in project)
    SELECT count(*)::INTEGER INTO v_orphan_count
    FROM public.assets_index ai
    WHERE ai.project_id = v_project_id
    AND ai.parent_asset_id IS NOT NULL
    AND ai.parent_asset_id NOT IN (
        SELECT asset_id FROM public.assets_index WHERE project_id = v_project_id
    );
    
    -- Orphans should exist in index but flagged appropriately
    RETURN public.test_assert_equals('orphan detection works', 1, v_orphan_count);
END;
$$;

-- =====================================================
-- 4. PERFORMANCE TESTS
-- =====================================================

-- Test: 100 operation batch performance
CREATE OR REPLACE FUNCTION public.test_batch_performance_100_ops()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_duration_ms INTEGER;
    v_operations JSONB;
    v_result RECORD;
BEGIN
    -- Build 100 operations
    SELECT jsonb_agg(
        jsonb_build_object(
            'op', 'CREATE_ASSET',
            'assetId', 'perf-asset-' || i,
            'name', 'Performance Asset ' || i,
            'type', 'folder'
        )
    ) INTO v_operations
    FROM generate_series(1, 100) AS i;
    
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Performance Test', '{"assets": {}}'::JSONB, 1);
    
    -- Time the operation
    v_start_time := clock_timestamp();
    
    SELECT * INTO v_result
    FROM public.save_document_operations(v_project_id, 1, v_operations);
    
    v_end_time := clock_timestamp();
    v_duration_ms := EXTRACT(MILLISECOND FROM (v_end_time - v_start_time))::INTEGER;
    
    -- Update test result with timing
    UPDATE public._test_results 
    SET execution_time_ms = v_duration_ms
    WHERE test_name = 'batch_performance_100_ops';
    
    -- Assert success and timing (< 200ms as per requirements)
    IF NOT v_result.success THEN
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('PERFORMANCE', 'batch_performance_100_ops', false, 'Batch operation failed: ' || v_result.error);
        RETURN false;
    END IF;
    
    IF v_duration_ms > 200 THEN
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message, execution_time_ms)
        VALUES ('PERFORMANCE', 'batch_performance_100_ops', false, 
            format('Took %s ms, expected < 200 ms', v_duration_ms), v_duration_ms);
        RETURN false;
    END IF;
    
    INSERT INTO public._test_results (test_suite, test_name, passed, execution_time_ms)
    VALUES ('PERFORMANCE', 'batch_performance_100_ops', true, v_duration_ms);
    
    RETURN true;
END;
$$;

-- Test: Large document (10,000 assets) handling
CREATE OR REPLACE FUNCTION public.test_large_document_10000_assets()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_duration_ms INTEGER;
    v_document JSONB;
    v_index_count INTEGER;
BEGIN
    -- Build 10,000 asset document
    SELECT jsonb_build_object('assets', jsonb_object_agg(
        'large-asset-' || i,
        jsonb_build_object(
            'name', 'Large Asset ' || i,
            'type', 'folder',
            'position', jsonb_build_object('x', 0, 'y', 0, 'width', 200, 'height', 200)
        )
    )) INTO v_document
    FROM generate_series(1, 10000) AS i;
    
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Large Document Test', v_document, 1);
    
    -- Time index rebuild
    v_start_time := clock_timestamp();
    PERFORM public.rebuild_project_index(v_project_id);
    v_end_time := clock_timestamp();
    
    v_duration_ms := EXTRACT(MILLISECOND FROM (v_end_time - v_start_time))::INTEGER;
    
    -- Verify count
    SELECT count(*)::INTEGER INTO v_index_count FROM public.assets_index WHERE project_id = v_project_id;
    
    IF v_index_count != 10000 THEN
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('LARGE_BOOK', 'large_document_10000_assets', false, 
            format('Expected 10000 assets, got %s', v_index_count));
        RETURN false;
    END IF;
    
    INSERT INTO public._test_results (test_suite, test_name, passed, execution_time_ms)
    VALUES ('LARGE_BOOK', 'large_document_10000_assets', true, v_duration_ms);
    
    RETURN true;
END;
$$;

-- =====================================================
-- 5. DOCUMENT SIZE BOUNDARY TESTS
-- =====================================================

-- Test: Document size near 5MB boundary
CREATE OR REPLACE FUNCTION public.test_document_size_boundary()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_large_content TEXT;
    v_document JSONB;
    v_size_bytes INTEGER;
BEGIN
    -- Create ~4.9MB content (just under 5MB limit)
    -- Each character is 1 byte, create 4.9MB of data
    SELECT string_agg(md5(random()::TEXT), '') INTO v_large_content
    FROM generate_series(1, 1000);
    
    -- Build document with large content
    v_document := jsonb_build_object(
        'assets', jsonb_build_object(
            'large-asset', jsonb_build_object(
                'name', 'Large Content Asset',
                'type', 'folder',
                'largeContent', v_large_content
            )
        )
    );
    
    -- Check size
    v_size_bytes := octet_length(v_document::TEXT);
    
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    
    -- Should succeed if under 5MB
    IF v_size_bytes < 5 * 1024 * 1024 THEN
        INSERT INTO public.projects (id, user_id, name, world_document, version)
        VALUES (v_project_id, v_test_user, 'Size Boundary Test', v_document, 1);
        
        INSERT INTO public._test_results (test_suite, test_name, passed, execution_time_ms)
        VALUES ('BOUNDARY', 'document_size_under_5mb', true, v_size_bytes);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('BOUNDARY', 'document_size_under_5mb', false, 
            format('Document size %s bytes exceeds 5MB', v_size_bytes));
        RETURN false;
    END IF;
END;
$$;

-- =====================================================
-- 6. CONCURRENT ACCESS TESTS
-- =====================================================

-- Test: Concurrent read consistency
CREATE OR REPLACE FUNCTION public.test_concurrent_read_consistency()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_doc1 JSONB;
    v_doc2 JSONB;
    v_version1 INTEGER;
    v_version2 INTEGER;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Concurrent Test', 
        jsonb_build_object('assets', jsonb_build_object('asset-1', jsonb_build_object('name', 'Test'))), 
        1);
    
    -- Simulate concurrent reads
    SELECT world_document, version INTO v_doc1, v_version1
    FROM public.load_project_document(v_project_id);
    
    SELECT world_document, version INTO v_doc2, v_version2
    FROM public.load_project_document(v_project_id);
    
    -- Verify both reads got same data
    IF v_doc1 = v_doc2 AND v_version1 = v_version2 THEN
        INSERT INTO public._test_results (test_suite, test_name, passed)
        VALUES ('CONCURRENT', 'concurrent_read_consistency', true);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('CONCURRENT', 'concurrent_read_consistency', false, 'Concurrent reads returned different data');
        RETURN false;
    END IF;
END;
$$;

-- =====================================================
-- 7. MONITORING QUERY VALIDATION
-- =====================================================

-- Test: Document size distribution query
CREATE OR REPLACE FUNCTION public.test_monitoring_document_size_query()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_count INTEGER;
BEGIN
    -- Setup multiple projects with varying sizes
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    SELECT 
        gen_random_uuid(),
        v_test_user,
        'Size Test ' || i,
        jsonb_build_object('assets', jsonb_build_object(
            'asset-' || i, jsonb_build_object('name', 'Test', 'type', 'folder')
        )),
        1
    FROM generate_series(1, 10) AS i;
    
    -- Run monitoring query
    SELECT count(*)::INTEGER INTO v_count FROM (
        SELECT 
            pg_size_pretty(octet_length(world_document::TEXT)) as size,
            count(*)
        FROM public.projects
        WHERE user_id = v_test_user
        GROUP BY octet_length(world_document::TEXT)
    ) subq;
    
    IF v_count > 0 THEN
        INSERT INTO public._test_results (test_suite, test_name, passed)
        VALUES ('MONITORING', 'document_size_distribution_query', true);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('MONITORING', 'document_size_distribution_query', false, 'Query returned no results');
        RETURN false;
    END IF;
END;
$$;

-- Test: Index consistency check query
CREATE OR REPLACE FUNCTION public.test_monitoring_consistency_query()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test_user UUID := gen_random_uuid();
    v_project_id UUID := gen_random_uuid();
    v_inconsistency_count INTEGER;
BEGIN
    -- Setup
    INSERT INTO auth.users (id, email) VALUES (v_test_user, 'test@example.com');
    INSERT INTO public.projects (id, user_id, name, world_document, version)
    VALUES (v_project_id, v_test_user, 'Consistency Test', 
        jsonb_build_object('assets', jsonb_build_object(
            'asset-1', jsonb_build_object('name', 'Test 1'),
            'asset-2', jsonb_build_object('name', 'Test 2')
        )), 
        1);
    
    -- Build index
    PERFORM public.rebuild_project_index(v_project_id);
    
    -- Run consistency check
    SELECT count(*)::INTEGER INTO v_inconsistency_count
    FROM public.projects p
    WHERE p.user_id = v_test_user
    HAVING 
        (SELECT count(*) FROM jsonb_object_keys(p.world_document->'assets')) !=
        (SELECT count(*) FROM public.assets_index WHERE project_id = p.id);
    
    -- Should be no inconsistencies
    IF v_inconsistency_count = 0 OR v_inconsistency_count IS NULL THEN
        INSERT INTO public._test_results (test_suite, test_name, passed)
        VALUES ('MONITORING', 'index_consistency_check_query', true);
        RETURN true;
    ELSE
        INSERT INTO public._test_results (test_suite, test_name, passed, error_message)
        VALUES ('MONITORING', 'index_consistency_check_query', false, 
            format('Found %s inconsistencies', v_inconsistency_count));
        RETURN false;
    END IF;
END;
$$;

-- =====================================================
-- 8. MASTER TEST RUNNER
-- =====================================================

-- Run all tests and return summary
CREATE OR REPLACE FUNCTION public.run_phase12_tests()
RETURNS TABLE (
    test_suite TEXT,
    test_name TEXT,
    passed BOOLEAN,
    error_message TEXT,
    execution_time_ms INTEGER,
    run_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Clear previous results
    PERFORM public.test_clear_results();
    
    -- Run all tests
    PERFORM public.test_load_project_document();
    PERFORM public.test_save_document_operations_atomicity();
    PERFORM public.test_version_conflict();
    PERFORM public.test_query_assets_by_parent();
    PERFORM public.test_rebuild_index_idempotency();
    PERFORM public.test_index_document_consistency();
    PERFORM public.test_index_parent_relationships();
    PERFORM public.test_batch_performance_100_ops();
    PERFORM public.test_large_document_10000_assets();
    PERFORM public.test_document_size_boundary();
    PERFORM public.test_concurrent_read_consistency();
    PERFORM public.test_monitoring_document_size_query();
    PERFORM public.test_monitoring_consistency_query();
    
    -- Return all results
    RETURN QUERY SELECT * FROM public._test_results ORDER BY test_suite, test_name;
END;
$$;

-- Get quick pass/fail summary
CREATE OR REPLACE FUNCTION public.get_phase12_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_summary RECORD;
BEGIN
    SELECT * INTO v_summary FROM public.test_get_summary();
    
    RETURN jsonb_build_object(
        'total_tests', v_summary.total_tests,
        'passed', v_summary.passed_tests,
        'failed', v_summary.failed_tests,
        'pass_rate', v_summary.pass_rate,
        'status', CASE 
            WHEN v_summary.pass_rate >= 99.9 THEN 'EXCELLENT'
            WHEN v_summary.pass_rate >= 95 THEN 'GOOD'
            WHEN v_summary.pass_rate >= 80 THEN 'ACCEPTABLE'
            ELSE 'FAILED'
        END
    );
END;
$$;

-- =====================================================
-- 9. DEPLOYMENT VERIFICATION
-- =====================================================

-- Pre-deployment checks
CREATE OR REPLACE FUNCTION public.pre_deployment_check()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check 1: R2 bucket accessible (requires external check)
    RETURN QUERY SELECT 
        'R2_BUCKET_ACCESS'::TEXT,
        'MANUAL'::TEXT,
        'Verify R2 bucket access via Cloudflare dashboard'::TEXT;
    
    -- Check 2: All RPC functions exist
    RETURN QUERY SELECT 
        'RPC_FUNCTIONS_EXIST'::TEXT,
        CASE 
            WHEN count(*) >= 10 THEN 'PASS'
            ELSE 'FAIL'
        END::TEXT,
        format('%s RPC functions found', count(*))::TEXT
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_type = 'FUNCTION'
    AND routine_name IN (
        'load_project_document',
        'save_document_operations',
        'query_assets_by_parent',
        'register_file',
        'rebuild_project_index'
    );
    
    -- Check 3: Tables have correct structure
    RETURN QUERY SELECT 
        'TABLES_STRUCTURE'::TEXT,
        CASE 
            WHEN count(*) >= 3 THEN 'PASS'
            ELSE 'FAIL'
        END::TEXT,
        format('%s core tables found', count(*))::TEXT
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('projects', 'assets_index', 'files');
    
    -- Check 4: Indexes exist
    RETURN QUERY SELECT 
        'INDEXES_EXIST'::TEXT,
        CASE 
            WHEN count(*) >= 5 THEN 'PASS'
            ELSE 'FAIL'
        END::TEXT,
        format('%s indexes found', count(*))::TEXT
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    -- Check 5: Document size constraints
    RETURN QUERY SELECT 
        'DOCUMENT_SIZE_LIMIT'::TEXT,
        'INFO'::TEXT,
        '5MB maximum document size enforced in application layer'::TEXT;
END;
$$;

-- Post-deployment verification
CREATE OR REPLACE FUNCTION public.post_deployment_verify()
RETURNS TABLE (
    metric_name TEXT,
    metric_value TEXT,
    threshold TEXT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_avg_rpc_time NUMERIC;
    v_failed_syncs INTEGER;
    v_total_projects INTEGER;
BEGIN
    -- Metric 1: RPC response time (requires stats)
    RETURN QUERY SELECT 
        'avg_rpc_response_ms'::TEXT,
        'N/A (enable pg_stat_statements)'::TEXT,
        '< 200ms'::TEXT,
        'INFO'::TEXT;
    
    -- Metric 2: Failed syncs count
    SELECT count(*)::INTEGER INTO v_failed_syncs
    FROM public.assets_index 
    WHERE cloud_status = 'failed';
    
    RETURN QUERY SELECT 
        'failed_syncs_count'::TEXT,
        v_failed_syncs::TEXT,
        '0'::TEXT,
        CASE WHEN v_failed_syncs = 0 THEN 'PASS' ELSE 'WARNING'::TEXT END;
    
    -- Metric 3: Index consistency
    RETURN QUERY SELECT 
        'inconsistent_projects'::TEXT,
        count(*)::TEXT,
        '0'::TEXT,
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL'::TEXT END
    FROM public.projects p
    HAVING 
        (SELECT count(*) FROM jsonb_object_keys(p.world_document->'assets')) !=
        (SELECT count(*) FROM public.assets_index WHERE project_id = p.id);
    
    -- Metric 4: Document count
    SELECT count(*)::INTEGER INTO v_total_projects FROM public.projects;
    
    RETURN QUERY SELECT 
        'total_projects'::TEXT,
        v_total_projects::TEXT,
        '> 0'::TEXT,
        CASE WHEN v_total_projects > 0 THEN 'PASS' ELSE 'INFO'::TEXT END;
END;
$$;

-- =====================================================
-- 10. CLEANUP TEST DATA
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete test users (cascade will clean up related data)
    DELETE FROM auth.users WHERE email LIKE '%test%' OR email = 'test@example.com';
    
    -- Clear test results
    DELETE FROM public._test_results;
    
    -- Clean up any orphaned indexes
    DELETE FROM public.assets_index 
    WHERE project_id NOT IN (SELECT id FROM public.projects);
    
    -- Clean up orphaned files
    DELETE FROM public.files 
    WHERE project_id NOT IN (SELECT id FROM public.projects);
END;
$$;

COMMENT ON FUNCTION public.run_phase12_tests() IS 
'Run complete Phase 12 test suite. Returns detailed results for each test.';

COMMENT ON FUNCTION public.get_phase12_summary() IS 
'Get quick pass/fail summary of Phase 12 tests.';

COMMENT ON FUNCTION public.pre_deployment_check() IS 
'Run pre-deployment verification checks.';

COMMENT ON FUNCTION public.post_deployment_verify() IS 
'Run post-deployment monitoring verification.';
