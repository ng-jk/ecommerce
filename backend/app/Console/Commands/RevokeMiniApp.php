<?php

namespace App\Console\Commands;

use App\Models\MiniAppPackage;
use App\Models\MiniAppVersion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RevokeMiniApp extends Command
{
    protected $signature = 'miniapps:revoke {package : Package slug} {version : Exact version} {--approver-id= : Configured platform approver for audit}';

    protected $description = 'Revoke approval of one Mini App release and invalidate launches';

    public function handle(): int
    {
        $approverId = filter_var($this->option('approver-id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (! $approverId || ! in_array($approverId, config('miniapps.approver_user_ids'), true)) {
            $this->error('A configured platform approver ID is required. The CLI operator is the privileged trust boundary; this flag records the approver, not authenticates a caller.');

            return self::FAILURE;
        }
        DB::transaction(function () use ($approverId): void {
            $package = MiniAppPackage::where('slug', $this->argument('package'))->firstOrFail();
            $version = MiniAppVersion::where('package_id', $package->id)->where('version', $this->argument('version'))->lockForUpdate()->firstOrFail();
            $version->update(['approved_at' => null, 'approved_by' => null, 'revoked_at' => now(), 'revoked_by' => $approverId, 'approval_generation' => $version->approval_generation + 1]);
        });
        $this->info('Revoked exact release. Installed copies are disabled at execution time.');

        return self::SUCCESS;
    }
}
