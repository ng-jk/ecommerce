<?php

namespace App\Domain;

use App\Http\Controllers\Controller;
use App\Models\PluginInstallation;
use App\Models\Shop;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PluginActions extends Controller
{
    private function fields(Request $request, array $allowed): void
    {
        $extra = array_diff(array_keys($request->all()), $allowed);
        if ($extra) {
            throw ValidationException::withMessages([reset($extra) => 'Unknown field.']);
        }
    }

    private function publicPlugin(PluginInstallation $plugin): array
    {
        return [...$plugin->only(['id', 'plugin_id', 'version', 'enabled', 'customer_enabled', 'max_credit', 'created_at', 'updated_at']), 'manifest' => BundledPlugins::manifest($plugin->plugin_id)];
    }

    public function listing(Request $request, Shop $shop): array
    {
        $this->fields($request, ['page', 'per_page', 'plugin_id', 'enabled']);
        foreach (['page', 'per_page'] as $field) {
            if (is_string($request->input($field)) && ctype_digit($request->input($field))) {
                $request->merge([$field => (int) $request->input($field)]);
            }
        }
        if (in_array($request->input('enabled'), ['true', 'false', '1', '0'], true)) {
            $request->merge(['enabled' => in_array($request->input('enabled'), ['true', '1'], true)]);
        }
        $data = $this->validate($request, ['page' => 'sometimes|integer:strict|min:1|max:100000', 'per_page' => 'sometimes|integer:strict|min:1|max:50', 'plugin_id' => ['sometimes', Rule::in(array_keys(PluginInstallation::options()))], 'enabled' => 'sometimes|boolean:strict']);
        $query = PluginInstallation::where('shop_id', $shop->id);
        if (isset($data['plugin_id'])) {
            $query->where('plugin_id', $data['plugin_id']);
        }
        if (isset($data['enabled'])) {
            $query->where('enabled', $data['enabled']);
        }
        $page = $query->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['plugins' => ['data' => array_map($this->publicPlugin(...), $page->items()), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]], 'options' => ['plugin_id' => PluginInstallation::options()]];
    }

    public function detail(Shop $shop, int $id): array
    {
        $plugin = PluginInstallation::where('shop_id', $shop->id)->findOrFail($id);

        return ['plugin' => $this->publicPlugin($plugin), 'options' => ['plugin_id' => PluginInstallation::options()]];
    }

    public function install(Request $request, Shop $shop): array
    {
        $this->fields($request, ['plugin_id', 'enabled', 'customer_enabled', 'max_credit']);
        $data = $this->validate($request, ['plugin_id' => ['required', Rule::in(array_keys(PluginInstallation::options()))], 'enabled' => 'sometimes|boolean:strict', 'customer_enabled' => 'sometimes|boolean:strict', 'max_credit' => 'sometimes|integer:strict|min:1|max:10000']);
        Shop::whereKey($shop->id)->lockForUpdate()->firstOrFail();
        if (PluginInstallation::where('shop_id', $shop->id)->where('plugin_id', $data['plugin_id'])->withTrashed()->exists()) {
            throw ValidationException::withMessages(['plugin_id' => 'This plugin is already installed or reserved.']);
        }
        $plugin = PluginInstallation::create(['shop_id' => $shop->id, 'plugin_id' => $data['plugin_id'], 'enabled' => $data['enabled'] ?? false, 'customer_enabled' => $data['customer_enabled'] ?? false, 'max_credit' => $data['max_credit'] ?? 1000]);

        return ['plugin' => $this->publicPlugin($plugin->refresh()), 'options' => ['plugin_id' => PluginInstallation::options()]];
    }

    public function update(Request $request, Shop $shop, int $id): array
    {
        $this->fields($request, ['expected_version', 'enabled', 'customer_enabled', 'max_credit']);
        $data = $this->validate($request, ['expected_version' => 'required|integer:strict|min:0', 'enabled' => 'sometimes|boolean:strict', 'customer_enabled' => 'sometimes|boolean:strict', 'max_credit' => 'sometimes|integer:strict|min:1|max:10000']);
        $plugin = PluginInstallation::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
        abort_unless($plugin->version === $data['expected_version'], 409, 'The plugin changed. Refresh before retrying.');
        unset($data['expected_version']);
        $plugin->update([...$data, 'version' => $plugin->version + 1]);

        return ['plugin' => $this->publicPlugin($plugin), 'options' => ['plugin_id' => PluginInstallation::options()]];
    }
}
