<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AssistantConversation extends Model
{
    use SoftDeletes;

    public const Draft = 'needs_input';

    public const Confirm = 'needs_confirmation';

    public const Complete = 'completed';

    protected $guarded = ['id'];

    protected $hidden = ['draft', 'result', 'receipt_hash', 'auth_version', 'deleted_at'];

    public static function options(): array
    {
        return [self::Draft => 'More information needed', self::Confirm => 'Confirmation needed', self::Complete => 'Completed'];
    }

    protected function casts(): array
    {
        return ['draft' => 'encrypted:array', 'result' => 'encrypted:array', 'expires_at' => 'datetime', 'version' => 'integer'];
    }
}
