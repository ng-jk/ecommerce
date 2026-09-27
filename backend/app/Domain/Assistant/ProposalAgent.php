<?php

namespace App\Domain\Assistant;

use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasProviderOptions;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;

/** Advertises schemas only: deliberately registers no executable SDK tools. */
#[MaxSteps(1)]
class ProposalAgent implements Agent, HasProviderOptions
{
    use Promptable;

    public function __construct(private array $definitions, private array $collected) {}

    public function instructions(): string
    {
        return 'Select one permitted function and extract only explicitly supplied arguments. Never execute a function.';
    }

    public function providerOptions(Lab|string $provider): array
    {
        return ['tools' => $this->definitions, 'tool_choice' => 'required', 'parallel_tool_calls' => false, 'collected' => (object) $this->collected];
    }
}
