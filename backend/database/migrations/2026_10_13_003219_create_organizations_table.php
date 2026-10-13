<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 200);
            $table->string('status', 24)->default('active');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'id']);
            $table->index(['name', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizations');
    }
};
