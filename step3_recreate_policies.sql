-- STEP 3: CLEAN UP AND RECREATE POLICIES
-- After tables exist and auth is working

-- First, drop all existing policies (they're invalid anyway)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname,
      r.tablename
    );
  END LOOP;
END $$;

-- Now recreate proper policies (only on existing tables)
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "projects_select_own" ON public.projects FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "projects_insert_own" ON public.projects FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "projects_update_own" ON public.projects FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "projects_delete_own" ON public.projects FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "assets_select_own" ON public.assets FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "assets_insert_own" ON public.assets FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "assets_update_own" ON public.assets FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "assets_delete_own" ON public.assets FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "books_select_own" ON public.books FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "books_insert_own" ON public.books FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "books_update_own" ON public.books FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "books_delete_own" ON public.books FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "prefs_select_own" ON public.user_preferences FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "prefs_insert_own" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "prefs_update_own" ON public.user_preferences FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "promo_codes_select_admin" ON public.promo_codes FOR SELECT TO service_role USING (true);
CREATE POLICY "promo_codes_insert_admin" ON public.promo_codes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "promo_codes_update_admin" ON public.promo_codes FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "promo_codes_delete_admin" ON public.promo_codes FOR DELETE TO service_role USING (true);
