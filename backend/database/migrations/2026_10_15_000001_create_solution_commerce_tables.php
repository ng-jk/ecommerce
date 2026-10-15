<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('solution_offerings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('product_id')->constrained();
            $table->string('application_key', 80);
            $table->unsignedInteger('version');
            $table->unsignedInteger('unit_amount');
            $table->string('currency', 3);
            $table->json('deliverables');
            $table->timestamp('published_at');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['product_id', 'version']);
            $table->index(['application_key', 'published_at']);
            $table->index(['shop_id', 'application_key', 'id']);
        });
        Schema::create('solution_purchases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('offering_id')->constrained('solution_offerings');
            $table->foreignId('order_id')->unique()->constrained();
            $table->foreignId('payment_id')->unique()->constrained();
            $table->foreignId('buyer_user_id')->constrained('users');
            $table->unsignedInteger('quoted_total');
            $table->string('currency', 3);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'id']);
        });
        Schema::create('solution_provisioning', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_id')->unique()->constrained('solution_purchases');
            $table->foreignId('grant_id')->unique()->constrained('application_entitlement_grants');
            $table->string('status', 32);
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
        if (DB::getDriverName() === 'pgsql') {
            foreach (['solution_offerings', 'solution_purchases'] as $name) {
                DB::statement("CREATE OR REPLACE FUNCTION reject_{$name}_change() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Solution evidence is immutable'; END; \$\$");
                DB::statement("CREATE TRIGGER immutable_{$name} BEFORE UPDATE OR DELETE ON {$name} FOR EACH ROW EXECUTE FUNCTION reject_{$name}_change()");
            }
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['solution_offerings', 'solution_purchases'] as $name) {
                DB::statement("CREATE TRIGGER immutable_{$name}_update BEFORE UPDATE ON {$name} BEGIN SELECT RAISE(ABORT, 'Solution evidence is immutable'); END");
                DB::statement("CREATE TRIGGER immutable_{$name}_delete BEFORE DELETE ON {$name} BEGIN SELECT RAISE(ABORT, 'Solution evidence is immutable'); END");
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('solution_provisioning');
        Schema::dropIfExists('solution_purchases');
        Schema::dropIfExists('solution_offerings');
        if (DB::getDriverName() === 'pgsql') {
            foreach (['solution_offerings', 'solution_purchases'] as $name) {
                DB::statement("DROP FUNCTION IF EXISTS reject_{$name}_change()");
            }
        }
    }
};
