<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_applications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('application_key', 80);
            $table->string('state', 24)->default('disabled');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'application_key']);
            $table->index(['organization_id', 'state', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_applications');
    }
};
