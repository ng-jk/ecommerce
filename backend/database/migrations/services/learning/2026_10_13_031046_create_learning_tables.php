<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learning_courses', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 80);
            $table->string('title', 200);
            $table->text('description');
            $table->enum('status', ['draft', 'published', 'archived'])->default('draft');
            $table->enum('access_mode', ['free', 'paid'])->default('free');
            $table->unsignedInteger('version')->default(0);
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'code']);
            $table->index(['organization_id', 'status', 'id']);
        });
        Schema::create('learning_lessons', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('course_id')->constrained('learning_courses');
            $table->string('title', 200);
            $table->text('content');
            $table->unsignedInteger('position');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['course_id', 'position']);
            $table->index(['course_id', 'id']);
        });
        Schema::create('learning_assessments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('course_id')->constrained('learning_courses');
            $table->string('title', 200);
            $table->text('questions');
            $table->unsignedInteger('pass_score');
            $table->unsignedInteger('attempt_limit');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['course_id', 'id']);
        });
        Schema::create('learning_enrollments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('course_id')->constrained('learning_courses');
            $table->unsignedBigInteger('platform_user_id');
            $table->enum('status', ['active', 'complete'])->default('active');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['course_id', 'platform_user_id']);
            $table->index(['platform_user_id', 'id']);
        });
        Schema::create('learning_lesson_views', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('learning_enrollments');
            $table->foreignId('lesson_id')->constrained('learning_lessons');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['enrollment_id', 'lesson_id']);
        });
        Schema::create('learning_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('learning_enrollments');
            $table->foreignId('assessment_id')->constrained('learning_assessments');
            $table->unsignedInteger('number');
            $table->unsignedInteger('score');
            $table->enum('status', ['passed', 'failed']);
            $table->text('answers');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['enrollment_id', 'assessment_id', 'number']);
            $table->index(['enrollment_id', 'assessment_id', 'status']);
            $table->index(['enrollment_id', 'id']);
        });
        Schema::create('learning_course_access_grants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('course_id')->constrained('learning_courses');
            $table->unsignedBigInteger('platform_user_id');
            $table->enum('source', ['verified_settlement']);
            $table->string('evidence_ref', 200)->unique();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['course_id', 'platform_user_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        foreach (['learning_course_access_grants', 'learning_attempts', 'learning_lesson_views', 'learning_enrollments',
            'learning_assessments', 'learning_lessons', 'learning_courses'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
