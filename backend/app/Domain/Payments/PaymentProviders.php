<?php

namespace App\Domain\Payments;

use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Shop;
use Illuminate\Validation\ValidationException;

class PaymentProviders
{
    public function options(string $shop): array
    {
        $default = config('payments.drivers.'.$shop, config('payments.driver'));
        $options = [];
        foreach (config('payments.enabled.'.$shop, [$default]) as $method) {
            try {
                $selection = $this->select($shop, $method);
                $options[$method] = $selection['provider'] === Payment::Custom
                    ? config('payments.custom.'.$method.'.label', 'Custom payment') : Payment::options('provider')[$method];
            } catch (ValidationException) {
                continue;
            }
        }

        return ['payment_methods' => $options ?: (object) [], 'default_payment_method' => array_key_exists($default, $options) ? $default : null];
    }

    public function select(string $shop, ?string $selected): array
    {
        $default = config('payments.drivers.'.$shop, config('payments.driver'));
        $method = $selected ?? $default;
        if (! in_array($method, config('payments.enabled.'.$shop, [$default]), true)) {
            throw ValidationException::withMessages(['payment_method' => 'Payment method is unavailable.']);
        }
        if ($method === 'stripe') {
            app(Stripe::class)->ensureConfigured();
        } elseif ($method === 'billplz') {
            app(Billplz::class)->ensureConfigured($shop);
        } elseif ($method !== 'simulated') {
            $custom = config('payments.custom.'.$method);
            if (! is_array($custom) || ($custom['enabled'] ?? false) !== true || ($custom['shop'] ?? null) !== $shop
                || ! is_string($custom['token_hash'] ?? null) || ! preg_match('/^[a-f0-9]{64}$/D', $custom['token_hash'])) {
                throw ValidationException::withMessages(['payment' => 'Unsupported payment configuration.']);
            }

            return ['method' => $method, 'provider' => 'custom', 'integration' => $method];
        }

        return ['method' => $method, 'provider' => $method, 'integration' => null];
    }

    public function customBill(Payment $payment, ?PaymentEvent $event): array
    {
        $config = config('payments.custom.'.$payment->integration);
        $payload = $event?->payload;
        abort_unless(is_array($config) && ($config['enabled'] ?? false) === true
            && ($config['shop'] ?? null) === Shop::findOrFail($payment->order->shop_id)->slug, 403);
        $paid = $payload !== null;
        if ($paid) {
            abort_unless(($payload['invoice_id'] ?? null) === $payment->public_id
                && hash_equals($config['token_hash'], $payload['credential_hash'] ?? ''), 403);
        }

        return ['id' => 'custom-'.$payment->public_id, 'collection_id' => $payment->integration,
            'reference_2' => $payment->public_id, 'amount' => $payment->order->total,
            'paid' => $paid, 'paid_amount' => $paid ? $payment->order->total : 0,
            'state' => $paid ? 'paid' : 'due', 'checkout_url' => null];
    }
}
