# Game Asset & Scene Flow / 遊戲素材與場景流程

This document outlines the asset requirements and scene flow for the game intro and transition sequences.
此文檔概述了遊戲開場和過渡序列的素材需求及場景流程。

## Scene Sequence / 場景順序

### 1. Context Intro / 背景交代 (A1)
*   **Description**: Sister packing box background context.
    *   描述：姐姐 pack 箱背景交代。
*   **Duration**: 2 ~ 4 seconds.
*   **Asset Type**: Video / Animation (MP4/WebM).
*   **ID**: `A1`

### 2. Opening Box / 打開空箱 (A2)
*   **Description**: Opening the empty Balikbayan box.
    *   描述：打開空箱。
*   **Duration**: ~2 seconds.
*   **Asset Type**: Video / Animation.
*   **ID**: `A2`

### 3. Packing Phase / 玩家砌野 (P1)
*   **Description**: Player organizing items in the box. This is the main gameplay loop (Shop Phase).
    *   描述：玩家砌野（Shopping Phase）。
*   **Duration**: Variable (User controlled).
*   **Asset Type**: Static Background Image (PNG).
    *   *Note*: The background should be static while the user interacts with the UI.
    *   備註：一張背景 PNG，唔郁。
*   **ID**: `P1`

### 4. Seal & Send / 封箱+寄出 (A3)
*   **Description**: Finishing packing, sealing the box, and sending it out.
    *   描述：砌完封箱 + 寄出。
*   **Duration**: ~3 seconds.
*   **Asset Type**: Video / Animation.
*   **ID**: `A3`

### 5. Plane Transformation / 飛機上面變身 (A4)
*   **Description**: Transformation sequence happening on the plane.
    *   描述：飛機上面變身。
*   **Duration**: ~3 seconds.
*   **Asset Type**: Video / Animation.
*   **ID**: `A4`

### 6. Battle Scene / 戰鬥畫面
*   **Description**: The main battle phase.
    *   描述：戰鬥畫面。
*   **Status**: To be implemented later (之後搞).

## Summary Table / 匯總表

| ID | Description (TC) | Description (EN) | Duration | Type |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | 姐姐pack箱背景交代 | Sister packing context | 2-4s | Video |
| **A2** | 打開空箱 | Open empty box | ~2s | Video |
| **P1** | 玩家砌野 (背景) | Player packing (BG) | Loop | Image |
| **A3** | 封箱+寄出 | Seal & Send | ~3s | Video |
| **A4** | 飛機上面變身 | Plane Transformation | ~3s | Video |
