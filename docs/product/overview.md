# Shop3i product overview

Shop3i means ecommerce through three interfaces: user, AI and application interfaces. A Shop is a merchant's independently configured commerce experience. The product target is a general Shopify-style commerce platform spanning the 42 categories in the [capability inventory](../commerce-capability-inventory.md); that scope is a roadmap and does not mean every category is implemented.

Each Shop is available through responsive web interfaces for mobile, tablet and desktop, native mobile applications, an AI chat interface, MCP and CLI integrations, and an application API over HTTPS with an SDK. The customer storefronts and admin interface are distinct products that use the same Shop services, contracts and authoritative data. They adapt presentation and interaction to their interface; they do not create separate business rules.

The current repository contains two branded storefronts, Maison and Volt, and Commerce Studio. These are examples of the multi-Shop product. Capabilities, enabled state, permissions and data remain scoped to the Shop and actor. Feature availability in one interface does not grant authority to another caller.

Business logic runs in shared platform services or explicitly isolated plugin services. PostgreSQL state and worker-processed commands are authoritative. A UI, AI model, MCP client, CLI, SDK or direct HTTP caller can propose an action; the backend validates and executes it under current identity, Shop, permission, version and business rules.

Product breadth, release status and open categories are tracked per capability in the inventory and [requirement status](../status/requirements.md). No interface mock, adapter or inventory entry alone establishes a working capability.
