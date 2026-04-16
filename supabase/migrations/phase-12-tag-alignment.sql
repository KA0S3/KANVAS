-- =====================================================
-- PHASE 12: TAG SYSTEM ALIGNMENT
-- =====================================================
-- KEEP FRONTEND AS IS - Backend-only changes
-- 
-- GOAL: Move tag configs to canonical document at world_document.tags
-- DECISION: Store in world_document.tags (single source of truth)
--
-- CHANGES:
-- 1. Add UPDATE_GLOBAL_TAGS operation for all tag configs
-- 2. Add UPDATE_ASSET_TAGS operation for per-asset tag associations
-- 3. Add load_tags() function to load tag configs from world_document
-- 4. Update save_document_operations function with new handlers
-- =====================================================

-- =====================================================
-- 1. UPDATE SAVE_DOCUMENT_OPERATIONS
-- =====================================================
-- Add new tag operations to the main mutation function
-- UPDATE_GLOBAL_TAGS: Store all tag configs in world_document.tags
-- UPDATE_ASSET_TAGS: Store per-asset tag associations
-- =====================================================

CREATE OR REPLACE FUNCTION public.save_document_operations(
    p_project_id UUID,
    p_expected_version INTEGER,
    p_operations JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    new_version INTEGER,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_version INTEGER;
    v_current_doc JSONB;
    v_new_doc JSONB;
    v_op JSONB;
    v_max_batch_size INTEGER := 100;
    v_max_document_size INTEGER := 5242880; -- 5MB
    v_op_type TEXT;
    v_asset_id TEXT;
    v_parent_id TEXT;
    v_old_parent_id TEXT;
    v_new_parent_id TEXT;
    v_affected_count INTEGER;
BEGIN
    -- 1. Validate batch size
    IF jsonb_array_length(p_operations) > v_max_batch_size THEN
        RETURN QUERY SELECT false, NULL::INTEGER, 'Batch size exceeds maximum of ' || v_max_batch_size::TEXT;
        RETURN;
    END IF;

    -- 2. Lock row and get current state
    SELECT version, world_document 
    INTO v_current_version, v_current_doc
    FROM public.projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    FOR UPDATE;

    IF v_current_version IS NULL THEN
        RETURN QUERY SELECT false, NULL::INTEGER, 'Project not found or access denied'::TEXT;
        RETURN;
    END IF;

    -- 3. Optimistic locking check
    IF v_current_version != p_expected_version THEN
        RETURN QUERY SELECT false, v_current_version, 'CONFLICT: Version mismatch. Expected ' || p_expected_version::TEXT || ', found ' || v_current_version::TEXT;
        RETURN;
    END IF;

    -- 4. Apply operations to document
    v_new_doc := v_current_doc;

    FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations)
    LOOP
        v_op_type := v_op->>'op';
        v_asset_id := v_op->>'assetId';
        
        CASE v_op_type
            -- CREATE_ASSET: Add new asset to document
            WHEN 'CREATE_ASSET' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assets,' || v_asset_id || '}',
                    jsonb_build_object(
                        'id', v_asset_id,
                        'parentId', v_op->>'parentId',
                        'children', COALESCE(v_op->'children', '[]'),
                        'name', COALESCE(v_op->>'name', 'New Asset'),
                        'type', COALESCE(v_op->>'type', 'folder'),
                        'position', COALESCE(v_op->'position', '{"x":0,"y":0,"width":200,"height":200,"zIndex":0}'::jsonb),
                        'isExpanded', COALESCE((v_op->>'isExpanded')::boolean, true),
                        'customFields', COALESCE(v_op->'customFields', '{}'),
                        'backgroundConfig', COALESCE(v_op->'backgroundConfig', '{}'),
                        'viewportConfig', COALESCE(v_op->'viewportConfig', '{}')
                    )
                );
                
                -- Add to parent's children array if has parent
                v_parent_id := v_op->>'parentId';
                IF v_parent_id IS NOT NULL AND v_parent_id != '' THEN
                    v_new_doc := jsonb_set(
                        v_new_doc,
                        '{assets,' || v_parent_id || ',children}',
                        COALESCE(v_new_doc->'assets'->v_parent_id->'children', '[]'::jsonb) || jsonb_build_array(v_asset_id)
                    );
                END IF;

            -- DELETE_ASSET: Remove asset from document
            WHEN 'DELETE_ASSET' THEN
                v_parent_id := v_op->>'parentId';
                
                -- Remove from parent's children array first
                IF v_parent_id IS NOT NULL AND v_parent_id != '' THEN
                    DECLARE
                        v_parent_children JSONB;
                        v_filtered_children JSONB;
                    BEGIN
                        v_parent_children := v_new_doc->'assets'->v_parent_id->'children';
                        IF v_parent_children IS NOT NULL THEN
                            SELECT jsonb_agg(elem)
                            INTO v_filtered_children
                            FROM jsonb_array_elements(v_parent_children) elem
                            WHERE elem #>> '{}' != v_asset_id;
                            
                            v_new_doc := jsonb_set(
                                v_new_doc,
                                '{assets,' || v_parent_id || ',children}',
                                COALESCE(v_filtered_children, '[]'::jsonb)
                            );
                        END IF;
                    END;
                END IF;
                
                -- Remove asset from document
                v_new_doc := v_new_doc #- '{assets,' || v_asset_id || '}';

            -- MOVE_ASSET: Change asset parent
            WHEN 'MOVE_ASSET' THEN
                DECLARE
                    v_old_parent_children JSONB;
                    v_new_parent_children JSONB;
                    v_filtered_old JSONB;
                BEGIN
                    v_old_parent_id := v_op->>'oldParentId';
                    v_new_parent_id := v_op->>'newParentId';
                    
                    -- Update asset's parentId
                    v_new_doc := jsonb_set(
                        v_new_doc,
                        '{assets,' || v_asset_id || ',parentId}',
                        to_jsonb(v_new_parent_id)
                    );
                    
                    -- Remove from old parent's children
                    IF v_old_parent_id IS NOT NULL AND v_old_parent_id != '' THEN
                        v_old_parent_children := v_new_doc->'assets'->v_old_parent_id->'children';
                        IF v_old_parent_children IS NOT NULL THEN
                            SELECT jsonb_agg(elem)
                            INTO v_filtered_old
                            FROM jsonb_array_elements(v_old_parent_children) elem
                            WHERE elem #>> '{}' != v_asset_id;
                            
                            v_new_doc := jsonb_set(
                                v_new_doc,
                                '{assets,' || v_old_parent_id || ',children}',
                                COALESCE(v_filtered_old, '[]'::jsonb)
                            );
                        END IF;
                    END IF;
                    
                    -- Add to new parent's children
                    IF v_new_parent_id IS NOT NULL AND v_new_parent_id != '' THEN
                        v_new_doc := jsonb_set(
                            v_new_doc,
                            '{assets,' || v_new_parent_id || ',children}',
                            COALESCE(v_new_doc->'assets'->v_new_parent_id->'children', '[]'::jsonb) || jsonb_build_array(v_asset_id)
                        );
                    END IF;
                END;

            -- UPDATE_POSITION: Change asset position/size/z-index
            WHEN 'UPDATE_POSITION' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assets,' || v_asset_id || ',position}',
                    jsonb_build_object(
                        'x', COALESCE((v_op->>'x')::int, COALESCE((v_new_doc->'assets'->v_asset_id->'position'->>'x')::int, 0)),
                        'y', COALESCE((v_op->>'y')::int, COALESCE((v_new_doc->'assets'->v_asset_id->'position'->>'y')::int, 0)),
                        'width', COALESCE((v_op->>'width')::int, COALESCE((v_new_doc->'assets'->v_asset_id->'position'->>'width')::int, 200)),
                        'height', COALESCE((v_op->>'height')::int, COALESCE((v_new_doc->'assets'->v_asset_id->'position'->>'height')::int, 200)),
                        'zIndex', COALESCE((v_op->>'zIndex')::int, COALESCE((v_new_doc->'assets'->v_asset_id->'position'->>'zIndex')::int, 0))
                    )
                );

            -- UPDATE_METADATA: Update asset name/type
            WHEN 'UPDATE_METADATA' THEN
                IF v_op->>'name' IS NOT NULL THEN
                    v_new_doc := jsonb_set(
                        v_new_doc,
                        '{assets,' || v_asset_id || ',name}',
                        to_jsonb(v_op->>'name')
                    );
                END IF;
                
                IF v_op->>'type' IS NOT NULL THEN
                    v_new_doc := jsonb_set(
                        v_new_doc,
                        '{assets,' || v_asset_id || ',type}',
                        to_jsonb(v_op->>'type')
                    );
                END IF;
                
                IF v_op->>'isExpanded' IS NOT NULL THEN
                    v_new_doc := jsonb_set(
                        v_new_doc,
                        '{assets,' || v_asset_id || ',isExpanded}',
                        to_jsonb((v_op->>'isExpanded')::boolean)
                    );
                END IF;

            -- UPDATE_VIEWPORT: Update global viewport state
            WHEN 'UPDATE_VIEWPORT' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{viewport}',
                    jsonb_build_object(
                        'offset', jsonb_build_object(
                            'x', COALESCE((v_op->>'offsetX')::int, 0),
                            'y', COALESCE((v_op->>'offsetY')::int, 0)
                        ),
                        'scale', COALESCE((v_op->>'scale')::numeric, 1.0),
                        'currentAssetId', v_op->>'currentAssetId'
                    )
                );

            -- UPDATE_BACKGROUND_CONFIG: Update asset background (LEGACY - kept for backward compatibility)
            -- PHASE 7: This is being deprecated in favor of UPDATE_GLOBAL_BACKGROUNDS
            WHEN 'UPDATE_BACKGROUND_CONFIG' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assets,' || v_asset_id || ',backgroundConfig}',
                    COALESCE(v_op->'config', '{}'::jsonb)
                );

            -- UPDATE_GLOBAL_BACKGROUNDS: PHASE 7 - Store all background configs in world_document.backgrounds
            -- This is the recommended approach (Option A) for single source of truth
            WHEN 'UPDATE_GLOBAL_BACKGROUNDS' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{backgrounds}',
                    COALESCE(v_op->'backgrounds', '{}'::jsonb)
                );

            -- UPDATE_ASSET_BACKGROUND: PHASE 7 - Store per-asset background config
            -- Alternative approach (Option B) - kept for future flexibility
            WHEN 'UPDATE_ASSET_BACKGROUND' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assets,' || (v_op->>'assetId') || ',backgroundConfig}',
                    COALESCE(v_op->'config', '{}'::jsonb)
                );

            -- UPDATE_CUSTOM_FIELDS: Update asset custom fields
            WHEN 'UPDATE_CUSTOM_FIELDS' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assets,' || v_asset_id || ',customFields}',
                    COALESCE(v_op->'customFields', '{}'::jsonb)
                );

            -- UPDATE_COVER_CONFIG: Update book cover configuration
            WHEN 'UPDATE_COVER_CONFIG' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{coverConfig}',
                    COALESCE(v_op->'config', '{}'::jsonb)
                );

            -- UPDATE_GLOBAL_TAGS: PHASE 12 - Store all tag configs in world_document.tags
            -- This is the recommended approach for single source of truth
            WHEN 'UPDATE_GLOBAL_TAGS' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{tags}',
                    COALESCE(v_op->'tags', '{}'::jsonb)
                );

            -- UPDATE_ASSET_TAGS: PHASE 12 - Store per-asset tag associations
            -- Stores tag associations in world_document.assetTags
            WHEN 'UPDATE_ASSET_TAGS' THEN
                v_new_doc := jsonb_set(
                    v_new_doc,
                    '{assetTags,' || (v_op->>'assetId') || '}',
                    COALESCE(v_op->'tagIds', '[]'::jsonb)
                );

            ELSE
                -- Unknown operation, log warning but continue
                RAISE WARNING 'Unknown operation type: %', v_op_type;
        END CASE;
    END LOOP;

    -- 5. Validate document size
    IF octet_length(v_new_doc::text) > v_max_document_size THEN
        RETURN QUERY SELECT false, NULL::INTEGER, 'Document size exceeds maximum of 5MB'::TEXT;
        RETURN;
    END IF;

    -- 6. Update project with optimistic locking
    UPDATE public.projects
    SET world_document = v_new_doc,
        version = version + 1,
        updated_at = NOW()
    WHERE id = p_project_id
    AND version = p_expected_version;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::INTEGER, 'Update failed - row locked or modified'::TEXT;
        RETURN;
    END IF;

    -- 7. INCREMENTAL INDEX UPDATES
    -- Apply only the changes needed for each operation type
    v_affected_count := 0;
    
    FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations)
    LOOP
        v_op_type := v_op->>'op';
        v_asset_id := v_op->>'assetId';
        
        CASE v_op_type
            -- CREATE_ASSET: Upsert the new asset
            WHEN 'CREATE_ASSET' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                v_affected_count := v_affected_count + 1;
                
                -- Also update parent's children count in index (if parent changed)
                v_parent_id := v_op->>'parentId';
                IF v_parent_id IS NOT NULL AND v_parent_id != '' THEN
                    PERFORM public.update_asset_index(
                        p_project_id,
                        v_parent_id,
                        v_new_doc->'assets'->v_parent_id
                    );
                END IF;

            -- DELETE_ASSET: Delete from index with cascade
            WHEN 'DELETE_ASSET' THEN
                PERFORM public.delete_asset_index(v_asset_id, true);
                v_affected_count := v_affected_count + 1;
                
                -- Update parent in index
                v_parent_id := v_op->>'parentId';
                IF v_parent_id IS NOT NULL AND v_parent_id != '' THEN
                    PERFORM public.update_asset_index(
                        p_project_id,
                        v_parent_id,
                        v_new_doc->'assets'->v_parent_id
                    );
                END IF;

            -- MOVE_ASSET: Update asset and all descendants
            WHEN 'MOVE_ASSET' THEN
                v_old_parent_id := v_op->>'oldParentId';
                v_new_parent_id := v_op->>'newParentId';
                
                -- Update the moved asset itself
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                
                -- Update all descendant paths (recursive)
                IF v_old_parent_id IS NOT NULL AND v_new_parent_id IS NOT NULL THEN
                    PERFORM public.update_descendant_paths(v_asset_id, v_asset_id, p_project_id);
                END IF;
                
                -- Update old and new parents in index
                IF v_old_parent_id IS NOT NULL AND v_old_parent_id != '' THEN
                    PERFORM public.update_asset_index(
                        p_project_id,
                        v_old_parent_id,
                        v_new_doc->'assets'->v_old_parent_id
                    );
                END IF;
                
                IF v_new_parent_id IS NOT NULL AND v_new_parent_id != '' THEN
                    PERFORM public.update_asset_index(
                        p_project_id,
                        v_new_parent_id,
                        v_new_doc->'assets'->v_new_parent_id
                    );
                END IF;
                
                v_affected_count := v_affected_count + 1;

            -- UPDATE_POSITION: Only update this asset
            WHEN 'UPDATE_POSITION' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                v_affected_count := v_affected_count + 1;

            -- UPDATE_METADATA: Only update this asset
            WHEN 'UPDATE_METADATA' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                v_affected_count := v_affected_count + 1;

            -- UPDATE_BACKGROUND_CONFIG: Only update this asset (LEGACY)
            WHEN 'UPDATE_BACKGROUND_CONFIG' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                v_affected_count := v_affected_count + 1;

            -- UPDATE_ASSET_BACKGROUND: PHASE 7 - Per-asset background update
            WHEN 'UPDATE_ASSET_BACKGROUND' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_op->>'assetId',
                    v_new_doc->'assets'->(v_op->>'assetId')
                );
                v_affected_count := v_affected_count + 1;

            -- UPDATE_CUSTOM_FIELDS: Only update this asset
            WHEN 'UPDATE_CUSTOM_FIELDS' THEN
                PERFORM public.update_asset_index(
                    p_project_id,
                    v_asset_id,
                    v_new_doc->'assets'->v_asset_id
                );
                v_affected_count := v_affected_count + 1;

            -- UPDATE_VIEWPORT: No index update needed (not stored in assets_index)
            -- UPDATE_GLOBAL_BACKGROUNDS: No index update needed (stored in world_document.backgrounds only)
            -- UPDATE_COVER_CONFIG: No index update needed (not stored in assets_index)
            -- UPDATE_GLOBAL_TAGS: No index update needed (stored in world_document.tags only)
            -- UPDATE_ASSET_TAGS: No index update needed (stored in world_document.assetTags only)
            ELSE
                -- No index update needed for other operations
                NULL;
        END CASE;
    END LOOP;

    RETURN QUERY SELECT true, v_current_version + 1, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.save_document_operations(UUID, INTEGER, JSONB) IS 
'Apply operations to world_document with optimistic locking and incremental index updates. 
Operations: CREATE_ASSET, DELETE_ASSET, MOVE_ASSET, UPDATE_POSITION, UPDATE_METADATA, UPDATE_VIEWPORT, 
UPDATE_BACKGROUND_CONFIG (legacy), UPDATE_GLOBAL_BACKGROUNDS (PHASE 7), UPDATE_ASSET_BACKGROUND (PHASE 7), 
UPDATE_CUSTOM_FIELDS, UPDATE_COVER_CONFIG, UPDATE_GLOBAL_TAGS (PHASE 12), UPDATE_ASSET_TAGS (PHASE 12). 
Returns {success, new_version, error}.';

-- =====================================================
-- 2. TAG LOADING FUNCTION
-- =====================================================
-- Helper function to load tag configs from world_document
-- Used by frontend to restore tag state on document load
-- =====================================================

CREATE OR REPLACE FUNCTION public.load_tags(
    p_project_id UUID
)
RETURNS TABLE (
    tags JSONB,
    assetTags JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(p.world_document->'tags', '{}'::jsonb) as tags,
        COALESCE(p.world_document->'assetTags', '{}'::jsonb) as assetTags
    FROM public.projects p
    WHERE p.id = p_project_id
    AND p.user_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.load_tags(UUID) IS 
'Load tag configs from world_document.tags and assetTags. Returns the tags object and assetTags associations or empty JSONB if none exists.';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check function was updated
SELECT 'PHASE 12 FUNCTION UPDATE' as check_type, 
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'save_document_operations',
    'load_tags'
)
ORDER BY p.proname;

-- =====================================================
-- PHASE 12 COMPLETE
-- =====================================================
-- Tag System now supports:
-- - UPDATE_GLOBAL_TAGS: Single source of truth for all tag configs
-- - UPDATE_ASSET_TAGS: Per-asset tag associations
-- - Tags stored in world_document.tags (consistent with background storage)
-- - Asset-tag associations stored in world_document.assetTags
-- - Easier backup/restore of entire book with tags included
--
-- Next step: Frontend can use load_tags() to restore tag state
-- File: src/services/DocumentMutationService.ts and src/stores/tagStore.ts
-- =====================================================
