# SEEK — Autonomous Search Intelligence

A React + TypeScript command center with grounded real-drone capture/Grok assessment and the original autonomous-search simulation. The existing dashboard design is preserved. Grounded live mode connects to the Python backend; demo mode still runs entirely in the browser without API keys or hardware.

## Grounded live capture

See the parent repo's [`docs/grounded-capture.md`](../docs/grounded-capture.md) for complete setup and API details. Power the stationary TT, connect its Wi-Fi plus tethered internet, close other Tello clients, and start the backend with `FLEET_CONFIG=devices.tello-ground.json` and `XAI_API_KEY` in backend `.env`. Run this frontend on port 5173. The Vite `/api` proxy targets localhost:8000 (override with server-side `SEEK_BACKEND_URL`).

In **GROUNDED LIVE**, select the real TT, enter an object/scene description, and click **Capture & assess**. The saved JPEG and actual Grok result are shown together. Movement is disabled. The forward ToF sensor is retired; room position remains unknown. A `?capture=<id>` URL reopens a saved result without another model call. Mission-log export includes the capture metadata.

## Grok mapping simulator

Start the backend with `FLEET_CONFIG=devices.scan-sim.json`, then click **Grok mapping** in this dashboard. Enter “Scan the environment” and start the autonomous scan. The workspace preserves the existing design and shows a rotatable 3D point cloud, observed occupancy grid, simulator camera, real Grok decisions and locally checked outcomes. The bounded trial scans from two viewpoints and lands; STOP & land and heartbeat expiry end it early. Unknown cells remain blocked. The JSON export contains the geometry and decisions. See [the full procedure and measured run](../docs/grok-mapping.md).

This is synthetic room geometry and simulator pose, with real model calls. Real drone scanning is gated; the physical watchdog remains unchanged. The original browser-only demo is still separate and uses no API.

Use the top mode button to switch to the original **SIMULATION MODE**. The simulation documentation below refers to that demo mode. The frontend never contains the Grok key. Public/static hosting needs a reverse proxy to the backend; this integration is configured for the local grounded setup.

## Run locally

Use Node.js 22 or later:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. To verify and build:

```sh
npm test
npm run build
npm run preview
```

The production output is in `dist/` and can be served by a static web host. No external images, fonts, or other runtime media services are required.

## Demonstrate a mission

1. Keep the default Museum Search objective or choose another scenario.
2. Press **Start Mission**. The default placement first reveals a partial clothing match, then a stronger candidate after approximately 80 simulated seconds.
3. Use **1× / 2× / 4×** to change simulation speed. Inspect sectors on the map or read the full mission log while the search continues.
4. Review the candidate's observed clothing and accessories. **Confirm clothing match** completes the mission; **Reject & continue** resumes exploration.
5. Closing the candidate review pauses it. **Resume** reopens the same review without moving the drone.
6. **New mission**, **Reset mission**, or the placement shuffle prepares another run. Changing scenarios selects a new fictional environment and objective.

The three scenarios are Museum Search, Missing Visitor (a consenting role-play), and Warehouse Inspection. Each includes a matching participant and visual decoys. Placement seeds make runs reproducible; reshuffling changes hidden locations.

## Supported target descriptions

The local parser recognizes color + clothing/accessory phrases, such as:

- “Find someone wearing a red hoodie and black trousers.”
- “Find someone wearing a blue jacket and carrying a yellow bag.”
- “Find an authorized worker wearing an orange safety vest, navy trousers and a white hard hat.”
- “Find a person in a purple coat and beige trousers with a green backpack.”

Supported garments include hoodies, jackets, shirts, T-shirts, vests, coats, sweaters, sweatshirts, trousers, pants, jeans, and shorts. Accessories include bags, backpacks, helmets, hard hats, caps, and hats. Colors include red, blue, black, yellow, green, orange, white, gray/grey, navy, purple, brown, beige, tan, pink, lime, teal, and olive.

The parser uses the first recognized item for upper clothing, lower clothing, and accessories. It does not interpret arbitrary natural language, names, identity, relationships, negations, or nonvisual attributes. A description with no recognized clothing cue produces an explanatory validation message. Matching evaluates the recognized appearance cues only.

## What is simulated

- The map is an authored fictional indoor environment, not a reconstruction from camera imagery.
- Telemetry, vehicle movement, camera scenes, people, and activity messages are generated locally.
- “Grok activity” is explicitly labeled as a simulated agent. No Grok API is called.
- The policy chooses among unobserved sectors and unresolved observations using coverage, distance, and already revealed clothing cues. It receives no hidden participant location or scenario seed.
- Distant observations reveal upper clothing only. A follow-up inspection reveals lower clothing and accessories. Camera imagery uses those revealed observations.
- Attribute agreement is a fraction of requested cues that match, not a calibrated probability or identity confidence score.
- Operator confirmation accepts an appearance match. It does not verify personal identity or establish that a real person is authorized.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components/` | Operator controls, map, camera, telemetry, logs, and evidence review |
| `src/types.ts` | Shared mission, region, observation, candidate, and event-facing data shapes |
| `src/useMission.ts` | React lifecycle and the simulation timer; cleans up on unmount |
| `src/simulation/engine.ts` | Framework-independent mission state machine and simulated movement |
| `src/simulation/policy.ts` | Observation-only search decisions and corridor routing |
| `src/simulation/target.ts` | Local visual-description parsing and attribute comparison |
| `src/simulation/scenarios.ts` | Fictional environments and default configuration |
| `src/adapters/simulatedWorld.ts` | Seeded hidden participants; reveals evidence only when a sector is observed |
| `src/adapters/contracts.ts` | Future drone, analysis, telemetry, and event-connection interfaces |
| `src/simulation/engine.test.ts` | Mission transitions, observation boundaries, seeded runs, and navigation tests |

Mission state is kept in memory. Resetting or refreshing clears the active run. The mission log can be exported as JSON from the interface.

## Future hardware and Grok integration

`DroneAdapter` describes connection, movement, hold, landing, and telemetry subscription. Implement it through a Python service using DJITelloPy; the browser should communicate with that service rather than access a drone directly.

`AnalysisAdapter` separates camera analysis from the next-search decision. A Grok implementation should return structured observations and a decision based only on the revealed mission context. Keep API credentials on the backend.

`MissionEventConnection` and the `MissionEvent` union provide a boundary for WebSocket or server-sent telemetry, observations, activity, and state updates. Replacing the local engine with a backend-driven controller should preserve the operator-facing `MissionController` interface. These contracts are integration seams, not implemented real-device connections.
