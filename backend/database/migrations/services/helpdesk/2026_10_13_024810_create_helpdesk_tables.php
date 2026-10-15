<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('helpdesk_queues', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 80);
            $table->string('name', 160);
            $table->string('status', 24)->default('active');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'status', 'id']);
        });
        Schema::create('helpdesk_queue_agents', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('queue_id');
            $table->unsignedBigInteger('platform_user_id');
            $table->string('status', 24)->default('active');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'queue_id', 'platform_user_id'], 'hd_agent_org_queue_user_unique');
            $table->index(['organization_id', 'platform_user_id', 'status', 'id'], 'hd_agent_user_status_index');
            $table->index(['organization_id', 'queue_id', 'status', 'id'], 'hd_agent_queue_status_index');
            $table->foreign(['organization_id', 'queue_id'], 'hd_agent_queue_fk')
                ->references(['organization_id', 'id'])->on('helpdesk_queues');
        });
        Schema::create('helpdesk_tickets', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('queue_id');
            $table->unsignedBigInteger('requester_platform_user_id');
            $table->unsignedBigInteger('assigned_platform_user_id')->nullable();
            $table->string('subject', 200);
            $table->text('description');
            $table->string('status', 24)->default('open');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'requester_platform_user_id', 'status', 'id'], 'hd_ticket_requester_index');
            $table->index(['organization_id', 'queue_id', 'status', 'id'], 'hd_ticket_queue_index');
            $table->index(['organization_id', 'assigned_platform_user_id', 'status', 'id'], 'hd_ticket_agent_index');
            $table->foreign(['organization_id', 'queue_id'], 'hd_ticket_queue_fk')
                ->references(['organization_id', 'id'])->on('helpdesk_queues');
            $table->foreign(['organization_id', 'queue_id', 'assigned_platform_user_id'], 'hd_ticket_agent_fk')
                ->references(['organization_id', 'queue_id', 'platform_user_id'])->on('helpdesk_queue_agents');
        });
        DB::statement('CREATE UNIQUE INDEX hd_queue_org_code_normalized ON helpdesk_queues (organization_id, lower(code))');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE helpdesk_queues ADD CONSTRAINT hd_queue_status CHECK (status IN ('active', 'disabled'))");
            DB::statement("ALTER TABLE helpdesk_queue_agents ADD CONSTRAINT hd_agent_status CHECK (status IN ('active', 'revoked'))");
            DB::statement("ALTER TABLE helpdesk_tickets ADD CONSTRAINT hd_ticket_status CHECK (status IN ('open', 'pending', 'resolved', 'closed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('helpdesk_tickets');
        Schema::dropIfExists('helpdesk_queue_agents');
        Schema::dropIfExists('helpdesk_queues');
    }
};
