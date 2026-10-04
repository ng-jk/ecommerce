<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plugin_installations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->string('plugin_id', 80);
            $table->unsignedBigInteger('version')->default(0);
            $table->boolean('enabled')->default(false);
            $table->boolean('customer_enabled')->default(false);
            $table->unsignedInteger('max_credit')->default(1000);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['shop_id', 'plugin_id']);
            $table->index(['shop_id', 'enabled', 'id']);
        });
        Schema::create('loyalty_balances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->unsignedBigInteger('points')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['shop_id', 'user_id']);
        });
        Schema::create('loyalty_credits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('operation_id')->constrained();
            $table->unsignedInteger('points');
            $table->string('reason', 200);
            $table->timestamps();
            $table->softDeletes();
            $table->unique('operation_id');
            $table->index(['shop_id', 'user_id', 'id']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE plugin_installations ADD CONSTRAINT plugin_max_credit CHECK (max_credit BETWEEN 1 AND 10000)');
            DB::statement('ALTER TABLE loyalty_credits ADD CONSTRAINT loyalty_credit_points CHECK (points BETWEEN 1 AND 10000)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_credits');
        Schema::dropIfExists('loyalty_balances');
        Schema::dropIfExists('plugin_installations');
    }
};
