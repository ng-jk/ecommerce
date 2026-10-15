<?php

namespace App\Domain;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Order;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\Payment;
use App\Models\PlatformUser;
use App\Models\Product;
use App\Models\SolutionOffering;
use App\Models\SolutionProvisioning;
use App\Models\SolutionPurchase;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SolutionCommerce
{
    public function offerings(Request $request, int $shopId): array
    {
        $page = max(1, (int) $request->input('page', 1));
        $perPage = min(50, max(1, (int) $request->input('per_page', 20)));
        $query = SolutionOffering::query()->where('shop_id', $shopId);
        if ($request->filled('application_key')) {
            $query->where('application_key', $request->input('application_key'));
        }
        $paginator = $query->orderBy('id')->paginate($perPage, ['id', 'product_id', 'application_key',
            'version', 'unit_amount', 'currency', 'deliverables', 'published_at'], 'page', $page);

        return ['data' => $paginator->items(), 'meta' => ['current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(), 'total' => $paginator->total(),
            'per_page' => $paginator->perPage()]];
    }

    public function offering(int $shopId, int $offeringId): array
    {
        $offering = SolutionOffering::query()->where('shop_id', $shopId)->findOrFail($offeringId);

        return ['offering' => $offering->only(['id', 'product_id', 'application_key',
            'version', 'unit_amount', 'currency', 'deliverables', 'published_at'])];
    }

    public function publish(User $actor, int $productId, string $applicationKey, array $deliverables): array
    {
        return DB::transaction(function () use ($actor, $productId, $applicationKey, $deliverables): array {
            $currentActor = User::query()->lockForUpdate()->findOrFail($actor->id);
            $product = Product::query()->lockForUpdate()->findOrFail($productId);
            abort_unless($currentActor->account_status === 'active' && $currentActor->role === User::Admin
                && $currentActor->shop_id === $product->shop_id && $product->active, 403);
            $descriptor = config('platform.applications.'.$applicationKey);
            abort_unless(! in_array($applicationKey, ['commerce', 'framework'], true)
                && is_array($descriptor) && ($descriptor['available'] ?? false) === true
                && ($descriptor['provisioned'] ?? false) === true, 422);
            if ($deliverables === [] || count($deliverables) > 20
                || array_filter($deliverables, fn (mixed $item): bool => ! is_string($item)
                    || trim($item) === '' || strlen($item) > 160)) {
                throw ValidationException::withMessages(['deliverables' => 'Provide up to twenty named deliverables.']);
            }
            abort_unless(! SolutionOffering::query()->where('product_id', $product->id)
                ->where('application_key', '!=', $applicationKey)->exists(), 422);
            $version = (int) SolutionOffering::query()->where('product_id', $product->id)->max('version') + 1;
            $id = DB::table('solution_offerings')->insertGetId([
                'shop_id' => $product->shop_id, 'product_id' => $product->id,
                'application_key' => $applicationKey, 'version' => $version,
                'unit_amount' => $product->price, 'currency' => 'MYR',
                'deliverables' => json_encode(array_values($deliverables), JSON_THROW_ON_ERROR),
                'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);

            return ['id' => $id, 'version' => $version, 'application_key' => $applicationKey,
                'unit_amount' => $product->price, 'currency' => 'MYR'];
        });
    }

    public function bind(User $actor, int $organizationId, int $offeringId, int $orderId): array
    {
        return DB::transaction(function () use ($actor, $organizationId, $offeringId, $orderId): array {
            $payment = Payment::query()->where('order_id', $orderId)->lockForUpdate()->firstOrFail();
            $order = Order::query()->lockForUpdate()->findOrFail($orderId);
            $currentActor = User::query()->lockForUpdate()->findOrFail($actor->id);
            abort_unless($currentActor->account_status === 'active' && $order->user_id === $currentActor->id
                && $currentActor->shop_id === $order->shop_id, 403);
            abort_unless(in_array($payment->provider, [Payment::Stripe, Payment::Billplz, Payment::Custom], true)
                && $order->payment_method !== Payment::Simulated, 422);
            $organization = Organization::query()->lockForUpdate()->findOrFail($organizationId);
            $membership = OrganizationMembership::query()->where('organization_id', $organization->id)
                ->where('user_id', $actor->id)->whereNull('platform_user_id')->lockForUpdate()->first();
            abort_unless($organization->status === Organization::Active
                && $membership?->status === OrganizationMembership::Active
                && $membership->role === OrganizationMembership::Owner, 403);
            abort_unless(ApplicationEntitlementGrant::activeFor($organizationId, 'framework')->exists()
                && OrganizationApplication::query()->where('organization_id', $organizationId)
                    ->where('application_key', 'framework')
                    ->where('state', OrganizationApplication::Installed)->exists(), 403);
            $offering = SolutionOffering::query()->find($offeringId);
            abort_unless($offering && $offering->shop_id === $order->shop_id
                && $order->solution_offering_id === $offering->id
                && $offering->currency === $order->currency
                && $offering->unit_amount === $order->subtotal
                && $order->total === $order->subtotal + $order->shipping
                && count($order->items) === 1
                && ($order->items[0]['product_id'] ?? null) === $offering->product_id
                && ($order->items[0]['solution_offering_id'] ?? null) === $offering->id
                && ($order->items[0]['price'] ?? null) === $offering->unit_amount
                && ($order->items[0]['quantity'] ?? null) === 1, 422);
            $existing = SolutionPurchase::query()->where('order_id', $orderId)->first();
            if ($existing) {
                abort_unless($existing->organization_id === $organizationId
                    && $existing->offering_id === $offeringId
                    && $existing->buyer_user_id === $actor->id, 409);

                return ['purchase_id' => $existing->id];
            }
            abort_unless(! in_array($payment->status, [Payment::Cancelled, Payment::Review], true), 409);
            $id = DB::table('solution_purchases')->insertGetId([
                'organization_id' => $organizationId, 'offering_id' => $offeringId,
                'order_id' => $order->id, 'payment_id' => $payment->id,
                'buyer_user_id' => $actor->id, 'quoted_total' => $order->total,
                'currency' => $order->currency, 'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($payment->status === Payment::Paid) {
                $this->settle($payment, $order);
            }

            return ['purchase_id' => $id];
        });
    }

    /** Called only inside the payment worker's verified Paid transition transaction. */
    public function settle(Payment $payment, Order $order): void
    {
        if ($payment->status !== Payment::Paid || $payment->paid_at === null
            || ! in_array($payment->provider, [Payment::Stripe, Payment::Billplz, Payment::Custom], true)) {
            return;
        }
        $purchase = SolutionPurchase::query()->where('payment_id', $payment->id)->lockForUpdate()->first();
        if (! $purchase) {
            return;
        }
        $offering = SolutionOffering::query()->find($purchase->offering_id);
        if (! $offering || $purchase->order_id !== $order->id
            || $purchase->quoted_total !== $order->total || $purchase->currency !== $order->currency
            || $offering->shop_id !== $order->shop_id) {
            throw new \UnexpectedValueException('Solution purchase does not match verified payment.');
        }
        $reference = 'solution-purchase:'.$purchase->id;
        $grant = ApplicationEntitlementGrant::query()->where('source', ApplicationEntitlementGrant::VerifiedSettlement)
            ->where('evidence_ref', $reference)->first();
        if (! $grant) {
            $grant = ApplicationEntitlementGrant::create([
                'organization_id' => $purchase->organization_id,
                'application_key' => $offering->application_key,
                'source' => ApplicationEntitlementGrant::VerifiedSettlement,
                'evidence_ref' => $reference, 'starts_at' => now(),
                'evidence' => ['payment_id' => $payment->id, 'order_id' => $order->id,
                    'provider' => $payment->provider, 'bill_id' => $payment->bill_id,
                    'offering_id' => $offering->id, 'offering_version' => $offering->version],
            ]);
        }
        DB::table('solution_provisioning')->insertOrIgnore([
            'purchase_id' => $purchase->id, 'grant_id' => $grant->id,
            'status' => SolutionProvisioning::Queued, 'available_at' => now(),
            'updated_at' => now(), 'created_at' => now(),
        ]);
    }

    public function processProvisioning(): bool
    {
        return DB::transaction(function (): bool {
            $job = DB::table('solution_provisioning')->whereIn('status', [SolutionProvisioning::Queued,
                SolutionProvisioning::WaitingService, SolutionProvisioning::WaitingInstallation])
                ->whereNull('deleted_at')
                ->where('available_at', '<=', now())->orderBy('id')
                ->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $job) {
                return false;
            }
            $purchase = SolutionPurchase::query()->findOrFail($job->purchase_id);
            $offering = SolutionOffering::query()->findOrFail($purchase->offering_id);
            $organization = Organization::query()->lockForUpdate()->findOrFail($purchase->organization_id);
            $grant = ApplicationEntitlementGrant::activeFor($purchase->organization_id, $offering->application_key)
                ->whereKey($job->grant_id)->lockForUpdate()->first();
            $descriptor = config('platform.applications.'.$offering->application_key);
            $foundation = ApplicationEntitlementGrant::activeFor($purchase->organization_id, 'framework')->exists()
                && OrganizationApplication::query()->where('organization_id', $purchase->organization_id)
                    ->where('application_key', 'framework')
                    ->where('state', OrganizationApplication::Installed)->exists();
            $ready = $organization->status === Organization::Active && $foundation && $grant
                && ($descriptor['available'] ?? false) === true
                && ($descriptor['provisioned'] ?? false) === true;
            $state = $grant ? SolutionProvisioning::WaitingService : SolutionProvisioning::Revoked;
            if ($ready) {
                $installation = OrganizationApplication::query()
                    ->where('organization_id', $purchase->organization_id)
                    ->where('application_key', $offering->application_key)->lockForUpdate()->first();
                if (! $installation) {
                    OrganizationApplication::create(['organization_id' => $purchase->organization_id,
                        'application_key' => $offering->application_key, 'state' => OrganizationApplication::Installed]);
                } elseif ($installation->state === OrganizationApplication::Installed) {
                    $state = SolutionProvisioning::Completed;
                } else {
                    $state = SolutionProvisioning::WaitingInstallation;
                }
                if (! $installation) {
                    $state = SolutionProvisioning::Completed;
                }
            }
            if ($state !== SolutionProvisioning::Completed && $state !== SolutionProvisioning::Revoked
                && $job->attempts >= 11) {
                $state = SolutionProvisioning::Failed;
            }
            DB::table('solution_provisioning')->where('id', $job->id)->update([
                'status' => $state, 'attempts' => $job->attempts + 1,
                'available_at' => in_array($state, [SolutionProvisioning::Completed,
                    SolutionProvisioning::Revoked, SolutionProvisioning::Failed], true) ? null : now()->addMinutes(5),
                'completed_at' => $state === SolutionProvisioning::Completed ? now() : null, 'updated_at' => now(),
            ]);

            return true;
        });
    }

    public function provisioningStatus(User|PlatformUser $actor, int $organizationId, int $purchaseId): array
    {
        $this->requireMembership($actor, $organizationId, false);
        $purchase = SolutionPurchase::query()->whereKey($purchaseId)
            ->where('organization_id', $organizationId)->firstOrFail();
        $job = SolutionProvisioning::query()->where('purchase_id', $purchase->id)->first();

        return ['purchase_id' => $purchase->id,
            'status' => $job?->status ?? SolutionProvisioning::AwaitingSettlement,
            'attempts' => $job?->attempts ?? 0,
            'options' => SolutionProvisioning::options()];
    }

    public function purchases(User|PlatformUser $actor, int $organizationId, int $page, int $perPage): array
    {
        $this->requireMembership($actor, $organizationId, false);
        $paginator = SolutionPurchase::query()->where('organization_id', $organizationId)
            ->orderBy('id')->paginate($perPage, ['id', 'offering_id', 'order_id',
                'quoted_total', 'currency', 'created_at'], 'page', $page);
        $jobs = SolutionProvisioning::query()->whereIn('purchase_id',
            array_map(fn (SolutionPurchase $purchase): int => $purchase->id, $paginator->items()))
            ->get()->keyBy('purchase_id');
        $data = array_map(fn (SolutionPurchase $purchase): array => [
            'id' => $purchase->id, 'offering_id' => $purchase->offering_id,
            'order_id' => $purchase->order_id, 'quoted_total' => $purchase->quoted_total,
            'currency' => $purchase->currency,
            'status' => $jobs->get($purchase->id)?->status ?? SolutionProvisioning::AwaitingSettlement,
        ], $paginator->items());

        return ['data' => $data, 'meta' => ['organization_id' => $organizationId,
            'current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(), 'per_page' => $paginator->perPage(),
            'options' => ['status' => SolutionProvisioning::options()]]];
    }

    public function authorizeResult(User|PlatformUser $actor, string $action, array $payload, array $result): void
    {
        if (in_array($action, ['solutions.offerings', 'solutions.offering', 'admin.solution.publish'], true)) {
            return;
        }
        $organizationId = (int) ($payload['id'] ?? $result['meta']['organization_id'] ?? 0);
        abort_unless($organizationId > 0, 403);
        $this->requireMembership($actor, $organizationId,
            in_array($action, ['platform.solution.bind', 'platform.solution.retry'], true));
        if (isset($result['purchase_id'])) {
            abort_unless(SolutionPurchase::query()->whereKey($result['purchase_id'])
                ->where('organization_id', $organizationId)->exists(), 403);
        }
        if (isset($result['data'])) {
            foreach ($result['data'] as $item) {
                abort_unless(SolutionPurchase::query()->whereKey($item['id'])
                    ->where('organization_id', $organizationId)->exists(), 403);
            }
        }
    }

    public function retryProvisioning(User|PlatformUser $actor, int $organizationId, int $purchaseId): array
    {
        return DB::transaction(function () use ($actor, $organizationId, $purchaseId): array {
            $purchase = SolutionPurchase::query()->whereKey($purchaseId)
                ->where('organization_id', $organizationId)->firstOrFail();
            $job = SolutionProvisioning::query()->where('purchase_id', $purchase->id)->lockForUpdate()->firstOrFail();
            $this->requireMembership($actor, $organizationId, true);
            abort_unless($job->status === SolutionProvisioning::Failed, 409);
            $grant = ApplicationEntitlementGrant::query()->whereKey($job->grant_id)->firstOrFail();
            abort_unless($grant->organization_id === $organizationId
                && ApplicationEntitlementGrant::activeFor($organizationId, $grant->application_key)
                    ->whereKey($grant->id)->exists(), 403);
            $job->update(['status' => SolutionProvisioning::Queued,
                'attempts' => 0, 'available_at' => now()]);

            return ['purchase_id' => $purchase->id, 'status' => $job->status];
        });
    }

    private function requireMembership(User|PlatformUser $actor, int $organizationId, bool $ownerOnly): void
    {
        abort_unless($actor->getKey() !== null && $actor::query()->whereKey($actor->getKey())
            ->where('account_status', 'active')->exists(), 403);
        $organization = Organization::query()->whereKey($organizationId)->lockForUpdate()->firstOrFail();
        abort_unless($organization->status === Organization::Active, 403);
        $column = $actor instanceof PlatformUser ? 'platform_user_id' : 'user_id';
        $other = $actor instanceof PlatformUser ? 'user_id' : 'platform_user_id';
        $membership = OrganizationMembership::query()->where('organization_id', $organizationId)
            ->where($column, $actor->id)->whereNull($other)->lockForUpdate()->first();
        abort_unless($membership?->status === OrganizationMembership::Active
            && in_array($membership->role, [OrganizationMembership::Member,
                OrganizationMembership::Admin, OrganizationMembership::Owner], true), 404);
        abort_unless(! $ownerOnly || $membership->role === OrganizationMembership::Owner, 403);
    }
}
