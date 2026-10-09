<?php

namespace App\Console\Commands;

use App\Domain\MiniAppArchive;
use App\Models\Shop;
use Illuminate\Console\Command;

class ImportMiniApp extends Command
{
    protected $signature = 'miniapps:import {archive : Local ZIP path} {--visibility=private : public or private} {--shop= : Owner shop slug for private packages}';

    protected $description = 'Validate and stage an immutable static Mini App ZIP for platform approval';

    public function handle(MiniAppArchive $archives): int
    {
        $visibility = (string) $this->option('visibility');
        $shopSlug = $this->option('shop');
        $shop = $shopSlug ? Shop::where('slug', $shopSlug)->firstOrFail() : null;
        $version = $archives->import((string) $this->argument('archive'), $visibility, $shop);
        $this->info("Staged {$version->manifest['id']} {$version->version} digest {$version->digest}. Approval required.");

        return self::SUCCESS;
    }
}
