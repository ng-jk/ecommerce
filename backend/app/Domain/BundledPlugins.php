<?php

namespace App\Domain;

use App\Models\PluginInstallation;
use App\Models\Shop;
use App\Models\User;
use App\Plugins\Loyalty\LoyaltyPlugin;

class BundledPlugins
{
    public static function manifest(string $pluginId): ?array
    {
        return $pluginId === PluginInstallation::Loyalty ? require app_path('Plugins/Loyalty/manifest.php') : null;
    }

    public static function allows(Shop $shop, ?User $user, string $action): bool
    {
        if (! in_array($action, self::manifest(PluginInstallation::Loyalty)['capabilities'], true)) {
            return true;
        }

        return app(LoyaltyPlugin::class)->isAvailable($shop, $user, $action);
    }
}
