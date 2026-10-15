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
        Schema::create('remote_commands', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('operation_id')->unique()->constrained();
            $table->uuid('command_id')->unique();
            $table->foreignId('organization_id')->constrained();
            $table->string('service', 80);
            $table->string('action', 100);
            $table->string('status', 20)->default('waiting');
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->text('result')->nullable();
            $table->string('response_digest', 64)->nullable();
            $table->timestamp('deadline_at');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'service', 'status', 'id']);
            $table->index(['status', 'deadline_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('remote_commands');
    }
};
