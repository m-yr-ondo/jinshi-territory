# Bot AI

Twelve bots share the same movement, territory and collision rules as humans.

Each bot receives randomized aggression and risk tolerance. Bots periodically choose between expanding away from safe territory, returning home to complete a capture, steering inward near the arena edge, or intercepting a nearby enemy trail. Their plans are updated less frequently than the physics tick so movement stays smooth without wasting server time.
