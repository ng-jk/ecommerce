<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('order_id')->unique()->constrained();
            $table->string('status')->index();
            $table->boolean('sandbox');
            $table->string('collection_id');
            $table->string('bill_id')->nullable();
            $table->unique(['sandbox', 'bill_id']);
            $table->text('checkout_url')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('next_check_at')->nullable()->index();
            $table->uuid('lease')->nullable();
            $table->timestamp('lease_until')->nullable()->index();
            $table->timestamp('paid_at')->nullable();
            $table->boolean('stock_released')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });
        Schema::create('payment_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained();
            $table->string('digest', 64)->unique();
            $table->text('payload');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at')->nullable()->index();
            $table->timestamp('processed_at')->nullable()->index();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payments');
    }
};
