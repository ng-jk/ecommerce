<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_conversations', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('platform_user_id')->constrained();
            $table->unsignedBigInteger('auth_version');
            $table->string('receipt_hash', 64);
            $table->string('action')->nullable();
            $table->string('status')->default('needs_input');
            $table->unsignedBigInteger('version')->default(0);
            $table->text('draft');
            $table->text('result')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['platform_user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_conversations');
    }
};
