<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->foreignId('solution_offering_id')->nullable()->after('shop_id')
                ->constrained('solution_offerings');
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("CREATE OR REPLACE FUNCTION protect_solution_order_quote() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF OLD.solution_offering_id IS NOT NULL AND (NEW.solution_offering_id IS DISTINCT FROM OLD.solution_offering_id OR NEW.items::jsonb IS DISTINCT FROM OLD.items::jsonb OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.shipping IS DISTINCT FROM OLD.shipping OR NEW.total IS DISTINCT FROM OLD.total OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN RAISE EXCEPTION 'Solution order quote is immutable'; END IF; RETURN NEW; END; \$\$");
            DB::statement('CREATE TRIGGER immutable_solution_order_quote BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_solution_order_quote()');
        } elseif (DB::getDriverName() === 'sqlite') {
            DB::statement("CREATE TRIGGER immutable_solution_order_quote BEFORE UPDATE ON orders WHEN OLD.solution_offering_id IS NOT NULL AND (NEW.solution_offering_id IS NOT OLD.solution_offering_id OR NEW.items IS NOT OLD.items OR NEW.subtotal IS NOT OLD.subtotal OR NEW.shipping IS NOT OLD.shipping OR NEW.total IS NOT OLD.total OR NEW.currency IS NOT OLD.currency OR NEW.payment_method IS NOT OLD.payment_method OR NEW.shop_id IS NOT OLD.shop_id OR NEW.user_id IS NOT OLD.user_id) BEGIN SELECT RAISE(ABORT, 'Solution order quote is immutable'); END");
        }
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS immutable_solution_order_quote'.(DB::getDriverName() === 'pgsql' ? ' ON orders' : ''));
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS protect_solution_order_quote()');
        }
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('solution_offering_id');
        });
    }
};
