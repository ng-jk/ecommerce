<?php

namespace App\Modules\Builder;

use Illuminate\Validation\ValidationException;

final class BuilderBlockSchema
{
    public static function options(): array
    {
        return ['heading' => 'Heading', 'paragraph' => 'Paragraph',
            'image' => 'Image', 'button' => 'Button'];
    }

    /** @return list<array<string, int|string>> */
    public static function validate(mixed $blocks): array
    {
        if (! is_array($blocks) || ! array_is_list($blocks) || count($blocks) > 20) {
            throw ValidationException::withMessages(['blocks' => 'Provide at most 20 ordered blocks.']);
        }
        $clean = [];
        foreach ($blocks as $index => $block) {
            $field = "blocks.$index";
            if (! is_array($block) || ! isset($block['type']) || ! is_string($block['type'])) {
                throw ValidationException::withMessages([$field => 'Choose a valid block type.']);
            }
            $keys = match ($block['type']) {
                'heading' => ['type', 'text', 'level'],
                'paragraph' => ['type', 'text'],
                'image' => ['type', 'src', 'alt'],
                'button' => ['type', 'label', 'url'],
                default => throw ValidationException::withMessages([$field => 'Choose a valid block type.']),
            };
            if (array_diff(array_keys($block), $keys) || array_diff($keys, array_keys($block))) {
                throw ValidationException::withMessages([$field => 'Block fields do not match its type.']);
            }
            $clean[] = match ($block['type']) {
                'heading' => ['type' => 'heading', 'text' => self::plain($block['text'], "$field.text", 200),
                    'level' => self::level($block['level'], "$field.level")],
                'paragraph' => ['type' => 'paragraph', 'text' => self::plain($block['text'], "$field.text", 2000)],
                'image' => ['type' => 'image', 'src' => self::url($block['src'], "$field.src"),
                    'alt' => self::plain($block['alt'], "$field.alt", 200)],
                'button' => ['type' => 'button', 'label' => self::plain($block['label'], "$field.label", 100),
                    'url' => self::url($block['url'], "$field.url")],
            };
        }

        return $clean;
    }

    private static function plain(mixed $value, string $field, int $max): string
    {
        if (! is_string($value) || trim($value) === '' || mb_strlen($value) > $max ||
            preg_match('/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/u', $value)) {
            throw ValidationException::withMessages([$field => 'Enter plain text within the allowed length.']);
        }

        return trim($value);
    }

    private static function level(mixed $value, string $field): int
    {
        if (! is_int($value) || $value < 1 || $value > 3) {
            throw ValidationException::withMessages([$field => 'Heading level must be 1, 2, or 3.']);
        }

        return $value;
    }

    private static function url(mixed $value, string $field): string
    {
        if (! is_string($value) || strlen($value) > 2048 || str_starts_with($value, '//') ||
            preg_match('/[\x00-\x20<>]/', $value)) {
            throw ValidationException::withMessages([$field => 'Enter a valid HTTPS URL.']);
        }
        $parts = parse_url($value);
        if ($parts === false || strtolower($parts['scheme'] ?? '') !== 'https' ||
            empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) ||
            filter_var($value, FILTER_VALIDATE_URL) === false) {
            throw ValidationException::withMessages([$field => 'Enter a valid HTTPS URL.']);
        }

        return $value;
    }
}
