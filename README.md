<h1 align="center">🏡 BashaShift</h1>

<p align="center"><strong>Your Next Home. Your Next Move. Skip the Chaos.</strong></p>

<p align="center">A smarter way to find your next rental, plan your move, and connect with independent movers in Bangladesh.</p>

<p align="center">
  <a href="https://bashashift.onrender.com/"><img alt="Explore Live App" src="https://img.shields.io/badge/EXPLORE%20LIVE%20APP-21694F?style=for-the-badge"></a>
  <a href="docs/ACCEPTANCE_QA.md"><img alt="View Test Report" src="https://img.shields.io/badge/VIEW%20QA%20REPORT-305F72?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Mobile Friendly" src="https://img.shields.io/badge/Mobile--Friendly-F5F8F2?style=flat-square&labelColor=F5F8F2&color=21694F">
  <img alt="AI-Assisted Inventory" src="https://img.shields.io/badge/AI--Assisted%20Inventory-F5F8F2?style=flat-square&labelColor=F5F8F2&color=21694F">
  <img alt="Three Connected Roles" src="https://img.shields.io/badge/3%20Connected%20Roles-F5F8F2?style=flat-square&labelColor=F5F8F2&color=21694F">
</p>

---

## ✨ What is BashaShift?

Finding a home is only half the journey. Moving into it means organizing furniture, estimating expenses, and finding reliable help—often through disconnected conversations.

**BashaShift brings these steps together:** discover owner-published apartments, arrange viewings, prepare an AI-assisted moving inventory, compare quotes, and confirm a mover—all from one mobile-friendly platform.

## 🧭 One connected journey

**🏠 Find a home** → **📅 Request a viewing** → **📷 Scan furniture with AI** → **💰 Plan a moving budget** → **🚚 Compare quotes & confirm**

| 🏡 Property Owner | 🔑 Renter | 🚚 Moving Service Provider |
| :--- | :--- | :--- |
| Publish and manage rental listings | Find homes using simple filters | Discover eligible local moving requests |
| Add room photos and respond to inquiries | Book viewings and plan relocation | Submit independent price quotations |
| Manage incoming interest | Review quotes and select a mover | Coordinate confirmed bookings |

## 🪄 The AI feature that makes moving easier

**Take a photo → AI suggests furniture → You review the list → Get a planning estimate**

BashaShift uses **Mistral Small 3.1 Vision via Cloudflare Workers AI** to suggest furniture items and quantities from uploaded photos. Renters can correct every suggestion before applying it, or enter everything manually.

The **moving-budget range is an illustrative calculation**, not an AI-predicted market price. Apartment suggestions are based on transparent preference matching. **Movers set their own final quotation prices.**

## 🛠️ Built with

<p>
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-303030?style=flat-square&logo=express&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white">
  <img alt="Cloudflare Workers AI" src="https://img.shields.io/badge/Cloudflare%20Workers%20AI-F38020?style=flat-square&logo=cloudflare&logoColor=white">
  <img alt="Render" src="https://img.shields.io/badge/Render-171B26?style=flat-square&logo=render&logoColor=white">
</p>

React and Vite power the interface; Node.js and Express handle the server; Supabase provides authentication, PostgreSQL, and image storage. Optional road routing is supported when configured.

## ✅ Built and tested

**121 automated tests passed** in the latest reported development suite, including isolated scenarios with **3 renters, 1 owner and 3 moving providers**. The automated browser tests mock external service responses; **real furniture recognition was separately demonstrated on the live app**.

> **Prototype notice:** Property listings and mover identities are user-provided and not independently verified. Estimates are illustrative, and no online payments are collected.

---

<p align="center"><strong>Built by Israt Jahan</strong><br>Department of Computer Science and Engineering · East West University, Bangladesh</p>
<p align="center"><a href="https://bashashift.onrender.com/"><strong>🌐 Try BashaShift</strong></a></p>
