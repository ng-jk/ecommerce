<?php

namespace App\Domain\Assistant;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class FunctionGemma
{
    public function propose(string $message, array $tools, array $collected): array
    {
        $definitions = array_map(function (array $tool): array {
            $parameters = $tool['parameters'];
            foreach (['password', 'password_confirmation'] as $secret) {
                unset($parameters['properties'][$secret]);
                $parameters['required'] = array_values(array_diff($parameters['required'], [$secret]));
            }
            unset($parameters['additionalProperties']);
            $parameters['properties'] = (object) $parameters['properties'];

            return ['type' => 'function', 'function' => ['name' => $tool['name'], 'description' => $tool['description'], 'parameters' => $parameters]];
        }, $tools);
        unset($collected['password'], $collected['password_confirmation']);
        $response = Http::connectTimeout(3)->timeout(config('assistant.timeout'))->post(config('assistant.url').'/infer', ['message' => $message, 'tools' => $definitions, 'collected' => $collected]);
        if ($response->status() === 422) {
            throw ValidationException::withMessages(['message' => 'Please clarify the action and its parameters, or select an available action.']);
        }
        abort_unless($response->successful(), 503, 'Language service is unavailable.');
        $proposal = $response->json();
        abort_unless(is_array($proposal) && isset($proposal['name'], $proposal['arguments']) && is_string($proposal['name']) && is_array($proposal['arguments']), 503, 'Invalid language service response.');
        if (isset($proposal['arguments']['password']) || isset($proposal['arguments']['password_confirmation'])) {
            throw ValidationException::withMessages(['data.password' => 'Supply credentials through structured data.']);
        }

        $proposal['arguments'] = $this->ground($proposal['arguments'], mb_strtolower($message));

        return $proposal;
    }

    private function ground(array $arguments, string $message): array
    {
        $result = [];
        $words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        foreach ($arguments as $key => $value) {
            if (is_array($value)) {
                $result[$key] = $this->ground($value, $message);
            } elseif (is_string($value) && $value !== '' && str_contains($message, mb_strtolower($value))) {
                $result[$key] = $value;
            } elseif (is_int($value) && (preg_match('/(?<![0-9])'.preg_quote((string) $value, '/').'(?![0-9])/', $message) || (isset($words[$value]) && preg_match('/\\b'.$words[$value].'\\b/', $message)))) {
                $result[$key] = $value;
            } elseif (is_bool($value) && str_contains($message, $value ? 'true' : 'false')) {
                $result[$key] = $value;
            }
        }

        return array_is_list($arguments) ? array_values($result) : $result;
    }
}
