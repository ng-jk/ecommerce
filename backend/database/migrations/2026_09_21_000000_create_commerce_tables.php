<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->string('name');
            $table->string('category');
            $table->text('description');
            $table->string('image_url', 2048);
            $table->unsignedInteger('price');
            $table->unsignedInteger('stock');
            $table->json('specifications')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->index(['shop_id', 'active', 'category']);
        });
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('user_id');
            $table->foreign(['shop_id', 'user_id'])->references(['shop_id', 'id'])->on('users');
            $table->uuid('checkout_key');
            $table->string('status')->default('placed');
            $table->string('payment_method')->default('simulated');
            $table->string('currency')->default('MYR');
            $table->json('items');
            $table->json('shipping_address');
            $table->unsignedInteger('subtotal');
            $table->unsignedInteger('shipping');
            $table->unsignedInteger('total');
            $table->timestamps();
            $table->unique(['user_id', 'checkout_key']);
            $table->index(['shop_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
        Schema::dropIfExists('products');
    }
};
