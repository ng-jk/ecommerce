<?php

namespace App\Domain\Assistant;

use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ToolInput
{
    public function check(array $schema, mixed $value, string $path = 'data'): array
    {
        if ($value === null && ($schema['nullable'] ?? false)) {
            return [];
        }
        $type = $schema['type'] ?? 'object';
        $valid = match ($type) {
            'object' => is_array($value) && ($value === [] || ! array_is_list($value)),
            'array' => is_array($value) && array_is_list($value),
            'integer' => is_int($value), 'number' => is_int($value) || is_float($value),
            'boolean' => is_bool($value), 'string' => is_string($value), default => false,
        };
        if (! $valid) {
            throw ValidationException::withMessages([$path => "Expected $type."]);
        }
        if (isset($schema['enum']) && ! in_array($value, $schema['enum'], true)) {
            throw ValidationException::withMessages([$path => 'Choose a declared option.']);
        }
        if ((is_int($value) || is_float($value)) && ($value < ($schema['minimum'] ?? -PHP_INT_MAX) || $value > ($schema['maximum'] ?? PHP_INT_MAX))) {
            throw ValidationException::withMessages([$path => 'Value is outside the allowed range.']);
        }
        if (is_string($value) && (mb_strlen($value) > ($schema['maxLength'] ?? 5000) || (($schema['format'] ?? '') === 'uuid' && ! Str::isUuid($value)))) {
            throw ValidationException::withMessages([$path => 'Invalid string value.']);
        }
        $missing = [];
        if ($type === 'object') {
            foreach ($value as $key => $item) {
                $child = $schema['properties'][$key] ?? ($schema['additionalProperties'] ?? null);
                if (! is_array($child)) {
                    throw ValidationException::withMessages(["$path.$key" => 'Unknown field.']);
                }
                $missing = [...$missing, ...$this->check($child, $item, "$path.$key")];
            }
            foreach ($schema['required'] ?? [] as $key) {
                if (! array_key_exists($key, $value) || $value[$key] === '') {
                    $missing[] = ['field' => "$path.$key", ...$schema['properties'][$key]];
                }
            }
        }
        if ($type === 'array') {
            if (count($value) > ($schema['maxItems'] ?? 50)) {
                throw ValidationException::withMessages([$path => 'Too many items.']);
            }
            foreach ($value as $key => $item) {
                $missing = [...$missing, ...$this->check($schema['items'], $item, "$path.$key")];
            }
        }

        return $missing;
    }
}
