# Shop3i product overview

Shop3i is a general-purpose business service platform through three interfaces: user, AI and application interfaces. The [2026-10-13 scope amendment](../decisions/2026-10-13-service-platform.md) adds ERP, HR, Learning, Insights, CRM, Helpdesk, Lending, Framework and Builder capabilities. E-commerce showcases and sells general and customized product solutions and remains one platform application. This expanded scope is a roadmap, not a claim that the new products are implemented.

An organization is the platform customer and can use multiple applications without opening a shop. A Shop is an organization's independently configured commerce experience. The existing Shopify-style 42-category [commerce inventory](../commerce-capability-inventory.md) remains the commerce application's roadmap.

Each Shop is available through responsive web interfaces for mobile, tablet and desktop, native mobile applications, an AI chat interface, MCP and CLI integrations, and an application API over HTTPS with an SDK. The customer storefronts and admin interface are distinct products that use the same Shop services, contracts and authoritative data. They adapt presentation and interaction to their interface; they do not create separate business rules.

The current repository contains two branded storefronts, Maison and Volt, and Commerce Studio. These are examples of the multi-Shop product. Capabilities, enabled state, permissions and data remain scoped to the Shop and actor. Feature availability in one interface does not grant authority to another caller.

Business logic runs in shared platform services or explicitly isolated plugin services. PostgreSQL state and worker-processed commands are authoritative. A UI, AI model, MCP client, CLI, SDK or direct HTTP caller can propose an action; the backend validates and executes it under current identity, Shop, permission, version and business rules.

Product breadth, release status and open categories are tracked per capability in the inventory and [requirement status](../status/requirements.md). No interface mock, adapter or inventory entry alone establishes a working capability.
