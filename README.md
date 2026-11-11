# SBS-B1

Play Renju (15x15, standard Renju rules) against B1 in the browser. Everything runs locally in your browser via WebAssembly; no moves are sent anywhere.

Open the page: https://nasser-lim.github.io/sbs-b1/

- First load downloads about 90 MB of network weights (cached afterwards).
- The weights were trained on evaluations and search outputs produced by [Rapfi](https://github.com/dhbloo/rapfi) (engine: GPL v3; official networks: CC0). They are not Rapfi weight files.
- The win-rate values shown on the page are scaled network outputs, not calibrated probabilities.
- No license is granted for the weights or page code yet (all rights reserved).

Developer: Taewoo Lim (임태우) - eight@sbs.co.kr
