<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION erp_guard_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'Posted journals are immutable.';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'posted' THEN
            RAISE EXCEPTION 'Posted journals must be created through draft posting.';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted journals are immutable.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER erp_journal_immutable BEFORE INSERT OR UPDATE OR DELETE ON erp_journals
FOR EACH ROW EXECUTE FUNCTION erp_guard_journal();
CREATE TRIGGER erp_journal_no_truncate BEFORE TRUNCATE ON erp_journals
FOR EACH STATEMENT EXECUTE FUNCTION erp_guard_journal();
CREATE OR REPLACE FUNCTION erp_guard_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_status text;
    first_journal_id bigint;
    second_journal_id bigint;
BEGIN
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'Posted journal lines are immutable.';
    END IF;
    IF TG_OP = 'INSERT' THEN
        first_journal_id := NEW.journal_id;
    ELSIF TG_OP = 'DELETE' THEN
        first_journal_id := OLD.journal_id;
    ELSE
        first_journal_id := OLD.journal_id;
        second_journal_id := NEW.journal_id;
    END IF;
    FOR parent_status IN
        SELECT status FROM erp_journals
        WHERE id = first_journal_id OR id = second_journal_id
        ORDER BY id FOR UPDATE
    LOOP
        IF parent_status = 'posted' THEN
            RAISE EXCEPTION 'Posted journal lines are immutable.';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER erp_journal_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON erp_journal_lines
FOR EACH ROW EXECUTE FUNCTION erp_guard_journal_line();
CREATE TRIGGER erp_journal_line_no_truncate BEFORE TRUNCATE ON erp_journal_lines
FOR EACH STATEMENT EXECUTE FUNCTION erp_guard_journal_line();
SQL);

            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT' => 'NEW', 'UPDATE' => 'OLD', 'DELETE' => 'OLD'] as $operation => $row) {
                DB::statement("CREATE TRIGGER erp_journal_immutable_{$operation} BEFORE {$operation} ON erp_journals
                    WHEN {$row}.status = 'posted' BEGIN SELECT RAISE(ABORT, 'Posted journals are immutable.'); END");
            }
            DB::statement("CREATE TRIGGER erp_journal_line_immutable_INSERT BEFORE INSERT ON erp_journal_lines
                WHEN (SELECT status FROM erp_journals WHERE id = NEW.journal_id) = 'posted'
                BEGIN SELECT RAISE(ABORT, 'Posted journal lines are immutable.'); END");
            DB::statement("CREATE TRIGGER erp_journal_line_immutable_UPDATE BEFORE UPDATE ON erp_journal_lines
                WHEN (SELECT status FROM erp_journals WHERE id = OLD.journal_id) = 'posted'
                  OR (SELECT status FROM erp_journals WHERE id = NEW.journal_id) = 'posted'
                BEGIN SELECT RAISE(ABORT, 'Posted journal lines are immutable.'); END");
            DB::statement("CREATE TRIGGER erp_journal_line_immutable_DELETE BEFORE DELETE ON erp_journal_lines
                WHEN (SELECT status FROM erp_journals WHERE id = OLD.journal_id) = 'posted'
                BEGIN SELECT RAISE(ABORT, 'Posted journal lines are immutable.'); END");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP TRIGGER IF EXISTS erp_journal_line_no_truncate ON erp_journal_lines');
            DB::statement('DROP TRIGGER IF EXISTS erp_journal_line_immutable ON erp_journal_lines');
            DB::statement('DROP FUNCTION IF EXISTS erp_guard_journal_line()');
            DB::statement('DROP TRIGGER IF EXISTS erp_journal_no_truncate ON erp_journals');
            DB::statement('DROP TRIGGER IF EXISTS erp_journal_immutable ON erp_journals');
            DB::statement('DROP FUNCTION IF EXISTS erp_guard_journal()');

            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE', 'DELETE'] as $operation) {
                DB::statement("DROP TRIGGER IF EXISTS erp_journal_immutable_{$operation}");
                DB::statement("DROP TRIGGER IF EXISTS erp_journal_line_immutable_{$operation}");
            }
        }
    }
};
