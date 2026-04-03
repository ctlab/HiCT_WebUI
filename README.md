# Hi-CT_WebUI -- Web-based UI for HiCT interactive manual scaffolding tool

For more info about HiCT, please visit [HiCT repo page](https://github.com/ctlab/HiCT).

## Overview
This repo contains sources for HiCT web-based user interface made with Vue3 and Bootstrap, packaged with Electron.
Visit [releases page](https://github.com/ctlab/HiCT_WebUI/releases) to obtain binaries for your operating system.

### Supported features:
* Opening of HiCT contact map files;
* Drag/pan/zoom of contact map overview;
* Contig range selection using Shift+Drag or single click;
* Reverse and translocation of contig selection range;
* Grouping contig selection range into scaffold and ungrouping scaffolds;
* Linking FASTA for assembly;
* Export of FASTA for assembly;
* Export FASTA context of assembly for the selected region;
* Import of AGP assembly description files (only without split contigs).

## Operation instructions:
Make [HiCT server](https://github.com/ctlab/HiCT_Server) available at `http://localhost:5000` either by starting it locally or by using port forwarding from remote server. Put HiCT files into server's data directory (you can convert Coolers using [HiCT_Utils](https://github.com/ctlab/HiCT_Utils)). Start Electron-based Web UI by unzipping binary distribution and launching `.exe` file (Windows) or by launching `.AppImage` file (linux, make sure you've made `chmod +x` for it). 
Click File -> Open and select HiCT file you want to interact with. Tiles should start loading on a contact map. Use single clicks or Shift+dragging at any time to perform range selection. Click tool buttons on the left side to perform actions with selection range.
After you've done, you can either save state using File -> Save in HiCT format, or export assembly info using Assembly menu in navigation bar at the top of the window.

## API documentation integration

WebUI now links directly to backend API docs via **View → API v1 docs...**.

- Interactive Swagger UI: `http://localhost:5000/api/v1/`
- OpenAPI source: `http://localhost:5000/api/v1/openapi.yaml`
