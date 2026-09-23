<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->uuid('code')->nullable(false)->change());
        Schema::table('orders', function (Blueprint $table): void {
            $table->uuid('order_number')->nullable(false)->change();
            foreach (['subtotal', 'shipping', 'total'] as $column) {
                $table->unsignedBigInteger($column)->change();
            }
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE users ADD CONSTRAINT user_role_valid CHECK (role IN ('customer', 'admin'))");
            DB::statement("ALTER TABLE orders ADD CONSTRAINT order_status_valid CHECK (status IN ('placed', 'processing', 'shipped', 'completed'))");
            DB::statement("ALTER TABLE operations ADD CONSTRAINT operation_status_valid CHECK (status IN ('queued', 'processing', 'succeeded', 'rejected', 'failed'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT user_role_valid');
            DB::statement('ALTER TABLE orders DROP CONSTRAINT order_status_valid');
            DB::statement('ALTER TABLE operations DROP CONSTRAINT operation_status_valid');
        }
        Schema::table('products', fn (Blueprint $table) => $table->uuid('code')->nullable()->change());
        Schema::table('orders', fn (Blueprint $table) => $table->uuid('order_number')->nullable()->change());
        // Keep widened money columns: narrowing could destroy valid existing totals.
    }
};
