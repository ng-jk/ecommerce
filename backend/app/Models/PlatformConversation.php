<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class PlatformConversation extends AssistantConversation
{
    use HasFactory;

    protected $table = 'platform_conversations';

    protected $hidden = ['platform_user_id', 'draft', 'result', 'receipt_hash', 'auth_version', 'deleted_at'];
}
