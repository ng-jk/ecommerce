<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['shops', 'users', 'products', 'orders'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->softDeletes());
        }
        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_status')->default('active');
            $table->unsignedBigInteger('version')->default(0);
            $table->unsignedBigInteger('auth_version')->default(0);
        });
        Schema::table('products', function (Blueprint $table): void {
            $table->uuid('code')->nullable()->unique();
            $table->unsignedBigInteger('version')->default(0);
            $table->index(['shop_id', 'category', 'id']);
            $table->index(['shop_id', 'active', 'id']);
        });
        Schema::table('orders', function (Blueprint $table): void {
            $table->uuid('order_number')->nullable()->unique();
            $table->unsignedBigInteger('version')->default(0);
            $table->index(['shop_id', 'user_id', 'id']);
            $table->index(['shop_id', 'status', 'id']);
        });
        foreach (['products' => 'code', 'orders' => 'order_number'] as $name => $column) {
            DB::table($name)->orderBy('id')->chunkById(100, function ($rows) use ($name, $column): void {
                foreach ($rows as $row) {
                    DB::table($name)->where('id', $row->id)->update([$column => (string) Str::uuid()]);
                }
            });
        }
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE products ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || description)) STORED");
            DB::statement('CREATE INDEX products_search_gin ON products USING GIN (search_vector)');
            DB::statement('ALTER TABLE products ADD CONSTRAINT product_nonnegative CHECK (stock >= 0 AND price > 0)');
            DB::statement('ALTER TABLE orders ADD CONSTRAINT order_totals CHECK (subtotal >= 0 AND shipping >= 0 AND total = subtotal + shipping)');
        }
        Schema::create('operations', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('user_id')->nullable()->constrained();
            $table->unsignedBigInteger('auth_version')->nullable();
            $table->unsignedBigInteger('token_id')->nullable();
            $table->string('scope');
            $table->uuid('idempotency_key');
            $table->string('payload_hash', 64);
            $table->string('receipt_hash', 64);
            $table->string('action');
            $table->text('payload');
            $table->string('status')->default('queued');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at');
            $table->text('result')->nullable();
            $table->unsignedInteger('http_status')->nullable();
            $table->json('state_before')->nullable();
            $table->json('state_after')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['scope', 'idempotency_key']);
            $table->index(['status', 'available_at', 'id']);
            $table->index(['user_id', 'status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operations');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE products DROP COLUMN search_vector');
            DB::statement('ALTER TABLE products DROP CONSTRAINT product_nonnegative');
            DB::statement('ALTER TABLE orders DROP CONSTRAINT order_totals');
        }
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['account_status', 'version', 'auth_version']));
        Schema::table('products', function (Blueprint $table): void {
            $table->dropIndex(['shop_id', 'category', 'id']);
            $table->dropIndex(['shop_id', 'active', 'id']);
            $table->dropColumn(['code', 'version']);
        });
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex(['shop_id', 'user_id', 'id']);
            $table->dropIndex(['shop_id', 'status', 'id']);
            $table->dropColumn(['order_number', 'version']);
        });
        foreach (['shops', 'users', 'products', 'orders'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropSoftDeletes());
        }
    }
};
