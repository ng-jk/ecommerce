<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SolutionProvisioning extends Model
{
    use SoftDeletes;

    protected $table = 'solution_provisioning';

    public const Queued = 'queued';

    public const AwaitingSettlement = 'awaiting_settlement';

    public const WaitingService = 'waiting_service';

    public const WaitingInstallation = 'waiting_installation';

    public const Completed = 'completed';

    public const Revoked = 'revoked';

    public const Failed = 'failed';

    protected $guarded = ['id'];

    protected $hidden = ['deleted_at', 'created_at', 'updated_at'];

    public static function options(): array
    {
        return [self::AwaitingSettlement => 'Awaiting verified payment',
            self::Queued => 'Queued', self::WaitingService => 'Waiting for service',
            self::WaitingInstallation => 'Installation disabled',
            self::Completed => 'Completed', self::Revoked => 'Entitlement revoked',
            self::Failed => 'Needs operator review'];
    }

    protected function casts(): array
    {
        return ['attempts' => 'integer', 'available_at' => 'datetime', 'completed_at' => 'datetime'];
    }
}
