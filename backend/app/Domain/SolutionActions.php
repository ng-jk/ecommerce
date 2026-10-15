<?php

namespace App\Domain;

use App\Models\PlatformUser;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class SolutionActions
{
    public function __construct(private SolutionCommerce $commerce) {}

    public function offerings(Request $request, Shop $shop): array
    {
        $this->input($request, ['page' => 'sometimes|integer|min:1|max:1000000',
            'per_page' => 'sometimes|integer|min:1|max:50',
            'application_key' => 'sometimes|string|max:80|regex:/^[a-z][a-z0-9_-]*$/D']);

        return $this->commerce->offerings($request, $shop->id);
    }

    public function offering(Shop $shop, int $id): array
    {
        return $this->commerce->offering($shop->id, $id);
    }

    public function publish(Request $request, Shop $shop, User $actor): array
    {
        $input = $this->input($request, ['product_id' => 'required|integer:strict|min:1',
            'application_key' => 'required|string|max:80|regex:/^[a-z][a-z0-9_-]*$/D',
            'deliverables' => 'required|array|min:1|max:20', 'deliverables.*' => 'required|string|max:160']);

        return ['offering' => $this->commerce->publish($actor, $input['product_id'],
            $input['application_key'], $input['deliverables'])];
    }

    public function bind(Request $request, User $actor, int $organizationId): array
    {
        $input = $this->input($request, ['offering_id' => 'required|integer:strict|min:1',
            'order_id' => 'required|integer:strict|min:1']);

        return ['organization_id' => $organizationId, ...$this->commerce->bind($actor, $organizationId,
            $input['offering_id'], $input['order_id'])];
    }

    public function purchases(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $input = $this->input($request, ['page' => 'sometimes|integer|min:1|max:1000000',
            'per_page' => 'sometimes|integer|min:1|max:50']);

        return $this->commerce->purchases($actor, $organizationId,
            (int) ($input['page'] ?? 1), (int) ($input['per_page'] ?? 20));
    }

    public function purchase(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $input = $this->input($request, ['purchase_id' => 'required|integer:strict|min:1']);

        return ['organization_id' => $organizationId,
            ...$this->commerce->provisioningStatus($actor, $organizationId, $input['purchase_id'])];
    }

    public function retry(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $input = $this->input($request, ['purchase_id' => 'required|integer:strict|min:1']);

        return ['organization_id' => $organizationId,
            ...$this->commerce->retryProvisioning($actor, $organizationId, $input['purchase_id'])];
    }

    private function input(Request $request, array $rules): array
    {
        $input = $request->all();
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        foreach (['page', 'per_page', 'purchase_id'] as $field) {
            if (isset($input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }

        return Validator::make($input, $rules)->validate();
    }
}
