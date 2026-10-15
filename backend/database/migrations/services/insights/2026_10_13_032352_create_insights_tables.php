<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['insight_datasets', 'insight_reports', 'insight_dashboards'] as $name) {
            Schema::create($name, function (Blueprint $table) use ($name): void {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('owner_platform_user_id');
                $table->string('name', 200);
                $table->enum('status', ['active', 'disabled'])->default('active');
                $table->enum('visibility', ['private', 'organization'])->default('private');
                $table->unsignedInteger('version')->default(0);
                if ($name === 'insight_datasets') {
                    $table->enum('source_kind', ['manual'])->default('manual');
                    $table->json('schema');
                    $table->text('rows');
                    $table->timestamp('imported_at')->nullable();
                } elseif ($name === 'insight_reports') {
                    $table->foreignId('dataset_id')->constrained('insight_datasets');
                    $table->json('definition');
                } else {
                    $table->json('report_ids');
                }
                $table->timestamps();
                $table->softDeletes();
                $table->index(['organization_id', 'status', 'id']);
                $table->index(['organization_id', 'owner_platform_user_id', 'id']);
            });
        }
    }

    public function down(): void
    {
        foreach (['insight_dashboards', 'insight_reports', 'insight_datasets'] as $name) {
            Schema::dropIfExists($name);
        }
    }
};
