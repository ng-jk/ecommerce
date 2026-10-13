<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->string('role', 24)->default('member');
            $table->string('status', 24)->default('invited');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'user_id']);
            $table->index(['organization_id', 'status', 'role', 'id']);
            $table->index(['user_id', 'status', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_memberships');
    }
};
