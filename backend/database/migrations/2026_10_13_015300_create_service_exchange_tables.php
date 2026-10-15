<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('service_request_nonces', function (Blueprint $table): void {
            $table->id();
            $table->string('source', 100);
            $table->uuid('nonce');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['source', 'nonce']);
            $table->index('created_at');
        });
        foreach (['service_deliveries', 'service_inboxes'] as $name) {
            Schema::create($name, function (Blueprint $table): void {
                $table->id();
                $table->uuid('message_id');
                $table->string('source', 100);
                $table->string('destination', 100);
                $table->string('digest', 64);
                $table->text('envelope');
                $table->string('status', 20)->default('queued');
                $table->unsignedInteger('attempts')->default(0);
                $table->uuid('lease')->nullable();
                $table->timestamp('lease_until')->nullable();
                $table->timestamp('available_at');
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['source', 'message_id']);
                $table->index(['destination', 'status', 'available_at', 'id']);
                $table->index(['status', 'lease_until']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_request_nonces');
        Schema::dropIfExists('service_inboxes');
        Schema::dropIfExists('service_deliveries');
    }
};
