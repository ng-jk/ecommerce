<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_activities', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('deal_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->string('type', 24);
            $table->string('summary', 500);
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'deal_id', 'id']);
            $table->index(['organization_id', 'deal_id', 'type', 'id']);
            $table->index(['organization_id', 'type', 'id']);
            $table->foreign(['organization_id', 'deal_id'])->references(['organization_id', 'id'])->on('crm_deals');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_activities');
    }
};
