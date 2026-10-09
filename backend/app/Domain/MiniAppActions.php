<?php

namespace App\Domain;

use App\Http\Controllers\Controller;
use App\Models\MiniAppInstallation;
use App\Models\MiniAppLaunch;
use App\Models\MiniAppPackage;
use App\Models\MiniAppVersion;
use App\Models\Shop;
use App\Models\User;
use App\Plugins\Loyalty\LoyaltyPlugin;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MiniAppActions extends Controller
{
    private function fields(Request $request, array $allowed): void
    {
        $extra = array_diff(array_keys($request->all()), $allowed);
        if ($extra) {
            throw ValidationException::withMessages([reset($extra) => 'Unknown field.']);
        }
    }

    private function page(Request $request): array
    {
        foreach (['page', 'per_page'] as $field) {
            if (is_string($request->input($field)) && ctype_digit($request->input($field))) {
                $request->merge([$field => (int) $request->input($field)]);
            }
        }

        return $this->validate($request, ['page' => 'sometimes|integer:strict|min:1|max:100000', 'per_page' => 'sometimes|integer:strict|min:1|max:50']);
    }

    private function pagination($page, callable $present): array
    {
        return ['data' => array_map($present, $page->items()), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]];
    }

    private function installation(MiniAppInstallation $installation): array
    {
        $package = MiniAppPackage::findOrFail($installation->package_id);
        $version = MiniAppVersion::findOrFail($installation->mini_app_version_id);

        return ['id' => $installation->id, 'package_id' => $package->id, 'slug' => $package->slug, 'name' => $package->name, 'visibility' => $package->visibility, 'version' => $version->version, 'digest' => $version->digest, 'enabled' => $installation->enabled, 'grants' => $installation->grants, 'capabilities' => $version->manifest['capabilities'], 'config_version' => $installation->version];
    }

    private function accessible(MiniAppPackage $package, Shop $shop): bool
    {
        return $package->visibility === 'public' || $package->owner_shop_id === $shop->id;
    }

    private function approvedVersion(MiniAppPackage $package, ?string $name): MiniAppVersion
    {
        $query = MiniAppVersion::where('package_id', $package->id)->whereNotNull('approved_at');
        if ($name !== null) {
            $query->where('version', $name);
        }

        return $query->orderByDesc('id')->firstOrFail();
    }

    private function grants(array $grants, MiniAppVersion $version): array
    {
        if (array_is_list($grants) && count($grants) === count(array_unique($grants)) && ! array_diff($grants, $version->manifest['capabilities'])) {
            return $grants;
        }
        throw ValidationException::withMessages(['grants' => 'Choose unique capabilities declared by this version.']);
    }

    public function listing(Request $request, Shop $shop): array
    {
        $this->fields($request, ['page', 'per_page']);
        $data = $this->page($request);
        $page = MiniAppInstallation::where('shop_id', $shop->id)->where('enabled', true)->whereHas('release', fn ($query) => $query->whereNotNull('approved_at'))->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['miniapps' => $this->pagination($page, $this->installation(...))];
    }

    public function adminListing(Request $request, Shop $shop): array
    {
        $this->fields($request, ['page', 'per_page', 'enabled']);
        $data = $this->page($request);
        $enabled = $request->input('enabled');
        if (in_array($enabled, ['true', 'false', '1', '0'], true)) {
            $request->merge(['enabled' => in_array($enabled, ['true', '1'], true)]);
        }
        $filter = $this->validate($request, ['enabled' => 'sometimes|boolean:strict']);
        $installedQuery = MiniAppInstallation::where('shop_id', $shop->id);
        if (isset($filter['enabled'])) {
            $installedQuery->where('enabled', $filter['enabled']);
        }
        $installed = $installedQuery->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);
        $available = MiniAppPackage::where(function ($query) use ($shop): void {
            $query->where('visibility', 'public')->orWhere('owner_shop_id', $shop->id);
        })->whereHas('versions', fn ($query) => $query->whereNotNull('approved_at'))->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['miniapps' => $this->pagination($installed, $this->installation(...)), 'catalog' => $this->pagination($available, function (MiniAppPackage $package): array {
            $versions = MiniAppVersion::where('package_id', $package->id)->whereNotNull('approved_at')->orderByDesc('id')->paginate(20, ['*'], 'version_page', 1);

            return ['package_id' => $package->id, 'slug' => $package->slug, 'name' => $package->name, 'visibility' => $package->visibility, 'versions' => array_map(fn (MiniAppVersion $version): array => ['version' => $version->version, 'digest' => $version->digest, 'capabilities' => $version->manifest['capabilities']], $versions->items()), 'versions_meta' => ['current_page' => $versions->currentPage(), 'last_page' => $versions->lastPage(), 'per_page' => $versions->perPage(), 'total' => $versions->total()]];
        }), 'options' => ['visibility' => MiniAppPackage::options()]];
    }

    public function install(Request $request, Shop $shop): array
    {
        $this->fields($request, ['package_id', 'version', 'enabled', 'grants']);
        $data = $this->validate($request, ['package_id' => 'required|integer:strict|min:1', 'version' => 'sometimes|string|max:40', 'enabled' => 'sometimes|boolean:strict', 'grants' => 'sometimes|array|list|max:5', 'grants.*' => 'string']);
        Shop::whereKey($shop->id)->lockForUpdate()->firstOrFail();
        $package = MiniAppPackage::findOrFail($data['package_id']);
        abort_unless($this->accessible($package, $shop), 404);
        $version = $this->approvedVersion($package, $data['version'] ?? null);
        abort_if(MiniAppInstallation::withTrashed()->where('shop_id', $shop->id)->where('package_id', $package->id)->exists(), 409, 'This package is already installed or reserved.');
        $installation = MiniAppInstallation::create(['shop_id' => $shop->id, 'package_id' => $package->id, 'mini_app_version_id' => $version->id, 'enabled' => $data['enabled'] ?? false, 'grants' => $this->grants($data['grants'] ?? [], $version)]);

        return ['miniapp' => $this->installation($installation->refresh())];
    }

    public function update(Request $request, Shop $shop, int $id): array
    {
        $this->fields($request, ['expected_version', 'version', 'enabled', 'grants']);
        $data = $this->validate($request, ['expected_version' => 'required|integer:strict|min:0', 'version' => 'sometimes|string|max:40', 'enabled' => 'sometimes|boolean:strict', 'grants' => 'sometimes|array|list|max:5', 'grants.*' => 'string']);
        $installation = MiniAppInstallation::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
        abort_unless($installation->version === $data['expected_version'], 409, 'The Mini App changed. Refresh before retrying.');
        $package = MiniAppPackage::findOrFail($installation->package_id);
        abort_unless($this->accessible($package, $shop), 404);
        $version = isset($data['version']) ? $this->approvedVersion($package, $data['version']) : MiniAppVersion::findOrFail($installation->mini_app_version_id);
        abort_unless($version->approved_at, 403);
        $installation->update(['mini_app_version_id' => $version->id, 'enabled' => $data['enabled'] ?? $installation->enabled, 'grants' => $this->grants($data['grants'] ?? $installation->grants, $version), 'version' => $installation->version + 1]);

        return ['miniapp' => $this->installation($installation)];
    }

    private function enabled(Shop $shop, int $id): MiniAppInstallation
    {
        $installation = MiniAppInstallation::where('shop_id', $shop->id)->where('enabled', true)->lockForUpdate()->findOrFail($id);
        $package = MiniAppPackage::findOrFail($installation->package_id);
        $version = MiniAppVersion::findOrFail($installation->mini_app_version_id);
        abort_unless($this->accessible($package, $shop) && $version->approved_at, 403);

        return $installation;
    }

    public function launch(Request $request, Shop $shop, User $user, int $id): array
    {
        $this->fields($request, []);
        $installation = $this->enabled($shop, $id);
        $version = MiniAppVersion::findOrFail($installation->mini_app_version_id);
        abort_unless($version->approved_at, 403);
        $origin = config('miniapps.asset_origin');
        $scheme = parse_url($origin, PHP_URL_SCHEME);
        $host = strtolower((string) parse_url($origin, PHP_URL_HOST));
        $statefulHosts = array_map(fn (string $entry): string => strtolower(explode(':', $entry)[0]), (array) config('sanctum.stateful', []));
        abort_unless($origin && ($scheme === 'https' || app()->environment(['local', 'testing']) && $scheme === 'http') && $origin !== rtrim(config('app.url'), '/') && $host && ! in_array($host, $statefulHosts, true), 503, 'Mini App asset origin is unavailable.');
        $launch = MiniAppLaunch::create(['public_id' => (string) Str::uuid(), 'shop_id' => $shop->id, 'user_id' => $user->id, 'installation_id' => $installation->id, 'mini_app_version_id' => $version->id, 'installation_version' => $installation->version, 'approval_generation' => $version->approval_generation, 'expires_at' => now()->addMinutes(15)]);

        return ['launch' => ['id' => $launch->public_id, 'entry_url' => $origin.'/miniapp-assets/'.$version->digest.'/'.$version->manifest['entry'], 'origin' => $origin, 'digest' => $version->digest, 'expires_at' => $launch->expires_at->toISOString(), 'capabilities' => $installation->grants]];
    }

    public function invoke(Request $request, Shop $shop, User $user, int $id): array
    {
        $this->fields($request, ['launch_id', 'capability', 'input']);
        $data = $this->validate($request, ['launch_id' => 'required|uuid', 'capability' => 'required|string', 'input' => 'present|array']);
        $installation = $this->enabled($shop, $id);
        $launch = MiniAppLaunch::where('public_id', $data['launch_id'])->where('shop_id', $shop->id)->where('user_id', $user->id)->where('installation_id', $installation->id)->lockForUpdate()->firstOrFail();
        abort_unless($launch->expires_at->isFuture() && $launch->mini_app_version_id === $installation->mini_app_version_id && $launch->installation_version === $installation->version, 403, 'Mini App session expired or changed.');
        $version = MiniAppVersion::findOrFail($installation->mini_app_version_id);
        abort_unless($version->approved_at && $launch->approval_generation === $version->approval_generation, 403, 'Mini App approval changed.');
        abort_unless(in_array($data['capability'], $installation->grants, true) && in_array($data['capability'], $version->manifest['capabilities'], true), 403);
        app(AccessPolicy::class)->enforceInShop($data['capability'], $user, $shop);
        $input = $data['input'];
        $capability = $data['capability'];
        if ($capability === 'product') {
            if (array_keys($input) !== ['id'] || ! is_int($input['id']) || $input['id'] < 1) {
                throw ValidationException::withMessages(['input' => 'Product requires a positive integer id.']);
            }
        } elseif ($capability === 'catalog') {
            if (array_diff(array_keys($input), ['page']) || isset($input['page']) && (! is_int($input['page']) || $input['page'] < 1 || $input['page'] > 100000)) {
                throw ValidationException::withMessages(['input' => 'Catalog accepts only page from 1 to 100000.']);
            }
        } else {
            if ($input !== []) {
                throw ValidationException::withMessages(['input' => 'This capability accepts no input.']);
            }
        }
        $bridge = Request::create('/', 'GET', $input);
        $bridge->setUserResolver(fn () => $user);
        $store = app(StoreActions::class);
        $response = match ($capability) {
            'catalog' => $store->products($bridge, $shop),
            'product' => $store->product($shop, (int) $input['id']),
            'cart.read' => $store->cart($bridge, $shop),
            'orders' => $store->orders($bridge, $shop),
            'plugin.loyalty.balance' => app(LoyaltyPlugin::class)->balance($bridge, $shop),
            default => abort(403),
        };

        return ['response' => $this->readProjection($capability, $response)];
    }

    private function readProjection(string $capability, array $result): array
    {
        $product = fn ($item): ?array => $item ? $item->only(['id', 'name', 'category', 'description', 'image_url', 'price', 'stock', 'specifications']) : null;

        return match ($capability) {
            'catalog' => ['shop' => $result['shop']->only(['slug', 'name']), 'categories' => $result['categories']->all(), 'products' => ['data' => array_map($product, $result['products']['data']), 'meta' => $result['products']['meta']]],
            'product' => ['product' => $product($result['product'])],
            'cart.read' => ['version' => $result['version'], 'items' => array_map(fn (array $line): array => ['product_id' => $line['product_id'], 'quantity' => $line['quantity'], 'product' => $product($line['product'])], $result['items'])],
            'orders' => ['orders' => ['data' => array_map(fn ($order): array => [...$order->only(['id', 'order_number', 'status', 'items', 'subtotal', 'shipping', 'total', 'version', 'created_at']), 'payment_status' => $order->payment?->status], $result['orders']['data']), 'meta' => $result['orders']['meta']]],
            'plugin.loyalty.balance' => ['balance' => ['points' => (int) $result['balance']['points']]],
            default => abort(403),
        };
    }
}
