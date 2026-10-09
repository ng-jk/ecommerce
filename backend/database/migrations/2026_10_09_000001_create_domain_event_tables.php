<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domain_events', function (Blueprint $table): void {
            $table->id();
            $table->string('event_key', 160)->unique();
            $table->string('topic', 80);
            $table->string('aggregate_type', 40);
            $table->unsignedBigInteger('aggregate_id');
            $table->json('payload');
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['published_at', 'id']);
        });
        Schema::create('event_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 80)->unique();
            $table->string('topic', 80);
            $table->string('handler', 160);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['topic', 'active']);
        });
        Schema::create('event_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('event_id')->constrained('domain_events');
            $table->foreignId('subscription_id')->constrained('event_subscriptions');
            $table->string('status', 20)->default('queued');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at');
            $table->uuid('lease')->nullable();
            $table->timestamp('lease_until')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['event_id', 'subscription_id']);
            $table->index(['status', 'available_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_deliveries');
        Schema::dropIfExists('event_subscriptions');
        Schema::dropIfExists('domain_events');
    }
};
