<?php

namespace App\Console\Commands;

use App\Models\MiniAppPackage;
use App\Models\MiniAppVersion;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ApproveMiniApp extends Command
{
    protected $signature = 'miniapps:approve {package : Package slug} {version : Exact version} {--approver-id= : Configured platform approver for audit}';

    protected $description = 'Approve one immutable staged Mini App release (privileged operator command)';

    public function handle(): int
    {
        $approverId = filter_var($this->option('approver-id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (! $approverId || ! in_array($approverId, config('miniapps.approver_user_ids'), true)) {
            $this->error('A configured platform approver ID is required. The CLI operator is the privileged trust boundary; this flag records the approver, not authenticates a caller.');

            return self::FAILURE;
        }
        $approver = User::find($approverId);
        if (! $approver || $approver->account_status !== 'active') {
            $this->error('The configured approver account is inactive or missing.');

            return self::FAILURE;
        }
        DB::transaction(function () use ($approverId): void {
            $package = MiniAppPackage::where('slug', $this->argument('package'))->firstOrFail();
            $version = MiniAppVersion::where('package_id', $package->id)->where('version', $this->argument('version'))->lockForUpdate()->firstOrFail();
            if ($version->approved_at) {
                throw new \RuntimeException('This release was already approved.');
            }
            $archive = Storage::disk('local')->path($version->archive_path);
            if (! is_file($archive) || ! hash_equals($version->digest, hash_file('sha256', $archive))) {
                throw new \RuntimeException('Staged archive integrity check failed.');
            }
            foreach ($version->asset_hashes as $name => $expected) {
                $path = 'miniapps/assets/'.$version->digest.'/'.$name;
                if (! Storage::disk('local')->exists($path) || ! hash_equals($expected, hash('sha256', Storage::disk('local')->get($path)))) {
                    throw new \RuntimeException('Staged asset integrity check failed.');
                }
            }
            $version->update(['approved_at' => now(), 'approved_by' => $approverId]);
        });
        $this->info('Approved exact staged release.');

        return self::SUCCESS;
    }
}
