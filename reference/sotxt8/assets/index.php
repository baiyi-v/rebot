<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>搜TXT吧</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>">
    <link rel="stylesheet" href="/assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="/assets/css/all.min.css">
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
        }
        html,
        body {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            overflow-x: clip;
        }
        body {
            background: linear-gradient(180deg, #f8fbff 0%, #f8f9fa 100%);
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
            color: #1f2937;
            overscroll-behavior-x: none;
        }
        .announcement-container {
            display: flex;
            align-items: center;
            overflow: hidden;
        }
        .hero-container {
            max-width: 1100px;
            margin: 32px auto;
            padding: 0 16px;
        }
        .auth-shell,
        .search-shell {
            background: rgba(255, 255, 255, 0.96);
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
            overflow: hidden;
        }
        .auth-shell {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(360px, 420px);
        }
        .hero-side {
            padding: 42px 36px;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
        }
        .hero-side h1 {
            margin: 0 0 14px;
            font-size: 34px;
            font-weight: 700;
        }
        .hero-side p {
            margin: 0 0 14px;
            font-size: 15px;
            line-height: 1.8;
            color: rgba(255,255,255,.88);
        }
        .hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(255,255,255,.15);
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 18px;
        }
        .hero-list {
            margin: 22px 0 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 12px;
        }
        .hero-list li {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
        }
        .auth-side {
            padding: 30px;
        }
        .auth-title {
            margin-bottom: 18px;
            text-align: center;
        }
        .auth-title h2 {
            margin: 0 0 10px;
            font-size: 28px;
            font-weight: 700;
        }
        .auth-title p {
            margin: 0;
            color: #64748b;
            font-size: 14px;
        }
        .notice-card {
            margin-bottom: 20px;
            border-radius: 14px;
            border: 1px solid #dbeafe;
            background: #eff6ff;
            color: #1d4ed8;
            padding: 12px 14px;
            font-size: 14px;
            line-height: 1.7;
        }
        .nav-tabs {
            border: none;
            margin-bottom: 20px;
            gap: 10px;
        }
        .nav-tabs .nav-link {
            border: none;
            border-radius: 999px;
            padding: 10px 18px;
            font-weight: 700;
            color: #475569;
            background: #f1f5f9;
        }
        .nav-tabs .nav-link.active {
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
        }
        .form-floating {
            margin-bottom: 16px;
        }
        .form-control {
            border-radius: 14px;
            border: 1px solid #dbe2ea;
            min-height: 56px;
        }
        .btn-main {
            border: none;
            border-radius: 14px;
            min-height: 52px;
            font-weight: 700;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
            width: 100%;
        }
        .btn-main:disabled {
            opacity: .75;
        }
        .btn-light-outline {
            border-radius: 14px;
            min-height: 46px;
            font-weight: 600;
        }
        .loading {
            display: none;
        }
        .search-shell {
            padding: 32px;
        }
        .topbar {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            margin-bottom: 26px;
        }
        .topbar-title h1 {
            margin: 0 0 8px;
            font-size: 30px;
            font-weight: 700;
        }
        .topbar-title p {
            margin: 0;
            color: #64748b;
        }
        .topbar-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .user-pill,
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
        }
        .user-pill {
            background: #eff6ff;
            color: #1d4ed8;
        }
        .status-pill.authorized {
            background: #ecfdf5;
            color: #047857;
        }
        .status-pill.pending {
            background: #fff7ed;
            color: #c2410c;
        }
        .quick-status {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 22px;
        }
        .status-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 18px 16px;
        }
        .status-card .label {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 8px;
        }
        .status-card .value {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
        }
        .search-form-card {
            border: 1px solid #e2e8f0;
            background: #fff;
            border-radius: 20px;
            padding: 22px;
            margin-bottom: 18px;
        }
        .search-form-card .tips {
            color: #64748b;
            font-size: 13px;
            margin-top: 10px;
        }
        .locked-overlay {
            border-radius: 16px;
            border: 1px dashed #fdba74;
            background: #fff7ed;
            color: #9a3412;
            padding: 14px 16px;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }
        .custom-links .btn {
            border-radius: 999px;
            margin: 0 4px 8px;
        }
        .floating-community-btn {
            position: fixed;
            right: 24px;
            bottom: 24px;
            width: 60px;
            height: 60px;
            border: none;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
            box-shadow: 0 16px 34px rgba(37, 99, 235, 0.25);
            z-index: 1040;
        }
        .floating-btn-tooltip {
            position: absolute;
            right: 68px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(15, 23, 42, 0.92);
            color: #fff;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: all .2s ease;
        }
        .floating-community-btn:hover .floating-btn-tooltip {
            opacity: 1;
            visibility: visible;
        }
        .back-to-top-btn {
            position: fixed;
            right: 20px;
            bottom: 106px;
            width: 52px;
            height: 52px;
            border: none;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
            box-shadow: 0 16px 34px rgba(37, 99, 235, 0.25);
            z-index: 1048;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(12px);
            transition: opacity .2s ease, visibility .2s ease, transform .2s ease;
        }
        .back-to-top-btn.show {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0);
        }
        .auth-modal-note {
            font-size: 13px;
            line-height: 1.8;
            color: #475569;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 12px 14px;
            margin-bottom: 18px;
        }
        .footer {
            margin: 30px auto 0;
            max-width: 1100px;
            padding: 0 16px 24px;
            text-align: center;
            color: #64748b;
            font-size: 13px;
        }
        @media (max-width: 992px) {
            .auth-shell {
                grid-template-columns: 1fr;
            }
            .quick-status {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 768px) {
            .hero-container {
                margin: 16px auto;
            }
            .search-shell,
            .auth-side,
            .hero-side {
                padding: 22px 16px;
            }
            .topbar {
                flex-direction: column;
            }
            .topbar-actions {
                justify-content: flex-start;
            }
            .floating-community-btn {
                width: 52px;
                height: 52px;
                right: 16px;
                bottom: 16px;
            }
            .back-to-top-btn {
                right: 16px;
                bottom: 96px;
                width: 48px;
                height: 48px;
            }
        }
        body {
            background: linear-gradient(180deg, #f7f9ff 0%, #eef2ff 100%);
            padding-bottom: 110px;
        }
        .announcement-container .container {
            max-width: 520px;
        }
        .hero-container {
            max-width: 500px;
            margin: 14px auto 0;
            padding: 0 12px;
        }
        .mobile-shell {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }
        .mobile-card {
            background: rgba(255,255,255,0.96);
            border-radius: 22px;
            padding: 18px 16px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.07);
            border: 1px solid rgba(226, 232, 240, 0.9);
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }
        .brand-card {
            text-align: center;
            padding: 30px 20px 24px;
        }
        .brand-icon {
            width: 72px;
            height: 72px;
            margin: 0 auto 16px;
            border-radius: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
            font-size: 30px;
            box-shadow: 0 16px 34px rgba(79, 70, 229, 0.28);
        }
        .brand-card h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 800;
            color: #0f172a;
        }
        .brand-card p {
            margin: 10px 0 0;
            color: #64748b;
            line-height: 1.7;
        }
        .brand-note {
            margin-top: 18px;
            padding: 14px 16px;
            border-radius: 18px;
            background: #eef4ff;
            color: #3157c8;
            font-size: 14px;
            line-height: 1.7;
        }
        .auth-card-block {
            padding: 22px 18px 24px;
        }
        .auth-title.compact {
            text-align: left;
            margin-bottom: 16px;
        }
        .auth-title.compact h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
        }
        .auth-card-block .nav-tabs {
            margin-bottom: 16px;
        }
        .auth-card-block .form-control {
            background: #f8fafc;
            border-color: #e2e8f0;
        }
        .app-page {
            display: none;
        }
        .app-page.active {
            display: block;
        }
        .home-header-card {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 20px 52px 18px;
            position: relative;
        }
        .home-header-meta {
            flex: 1;
            min-width: 0;
            text-align: center;
        }
        .home-header-meta h1 {
            margin: 10px 0 6px;
            font-size: 25px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
        }
        .home-header-meta p {
            margin: 0;
            color: #64748b;
            font-size: 14px;
            line-height: 1.5;
        }
        .mini-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            background: #eef2ff;
            color: #4338ca;
        }
        .mini-chip-action {
            border: none;
            cursor: pointer;
        }
        .icon-action-btn {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            border: 1px solid #dbe2ea;
            background: #fff;
            color: #334155;
            position: absolute;
            right: 16px;
            top: 16px;
        }
        .search-card-clean .card-caption,
        .profile-info-card .card-caption,
        .quick-link-card .card-caption {
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
        }
        .search-card-clean .input-group {
            padding: 5px;
            border-radius: 18px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            width: 100%;
            max-width: 100%;
        }
        .search-card-clean .form-control {
            min-height: 48px;
            border: none;
            background: transparent;
            box-shadow: none;
            font-size: 16px;
            min-width: 0;
        }
        .search-card-clean .btn {
            border-radius: 16px !important;
            min-width: 84px;
            min-height: 48px;
            font-weight: 700;
        }
        .search-helper {
            margin-top: 10px;
            color: #64748b;
            font-size: 12px;
            line-height: 1.6;
            text-align: center;
        }
        .auth-action-card {
            background: linear-gradient(180deg, #fffaf4 0%, #fff7ed 100%);
            border: 1px solid #fed7aa;
            box-shadow: none;
        }
        .auth-action-card strong {
            display: block;
            font-size: 16px;
            color: #9a3412;
            margin-bottom: 6px;
        }
        .auth-action-card p {
            margin: 0 0 10px;
            color: #9a3412;
            line-height: 1.6;
            font-size: 13px;
        }
        .auth-action-card .btn {
            min-height: 44px;
            font-weight: 700;
        }
        .community-notice-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            background: linear-gradient(180deg, #eff6ff 0%, #eef2ff 100%);
            border: 1px solid #bfdbfe;
            color: #1d4ed8;
            cursor: pointer;
            box-shadow: none;
        }
        .community-notice-card strong {
            display: block;
            font-size: 15px;
            margin-bottom: 4px;
            color: #1e40af;
        }
        .community-notice-card p {
            margin: 0;
            font-size: 13px;
            line-height: 1.6;
            color: #1d4ed8;
        }
        .community-notice-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 28px;
            padding: 0 8px;
            border-radius: 999px;
            background: #2563eb;
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            flex-shrink: 0;
        }
        .quick-entry-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 12px;
        }
        .quick-entry-btn {
            width: 100%;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 13px 10px;
            background: #f8fafc;
            box-shadow: none;
            font-weight: 700;
            color: #1e293b;
            font-size: 14px;
        }
        .quick-entry-btn i {
            display: block;
            font-size: 17px;
            margin-bottom: 6px;
            color: #4f46e5;
        }
        .quick-link-card .custom-links {
            text-align: left !important;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .quick-link-card .custom-links .btn {
            margin: 0;
            border-radius: 999px;
        }
        .profile-card-clean {
            text-align: center;
            padding-top: 28px;
        }
        .profile-avatar-wrap {
            position: relative;
            width: 88px;
            height: 88px;
            margin: 0 auto 14px;
        }
        .profile-avatar-lg {
            width: 88px;
            height: 88px;
            border-radius: 50%;
            object-fit: cover;
            box-shadow: 0 18px 38px rgba(79, 70, 229, 0.2);
            border: 4px solid #fff;
            display: block;
        }
        .profile-avatar-trigger {
            position: absolute;
            inset: 0;
            border: none;
            background: transparent;
            padding: 0;
            border-radius: 50%;
            overflow: hidden;
            cursor: pointer;
        }
        .profile-avatar-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: rgba(15, 23, 42, 0.38);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .profile-avatar-trigger:hover .profile-avatar-overlay,
        .profile-avatar-trigger:focus-visible .profile-avatar-overlay {
            opacity: 1;
        }
        .profile-avatar-trigger:focus-visible {
            outline: 2px solid #4f46e5;
            outline-offset: 2px;
        }
        .profile-card-clean h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
        }
        .profile-badges {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 10px;
            margin-top: 16px;
        }
        .profile-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-radius: 999px;
            background: #f8fafc;
            color: #334155;
            font-size: 13px;
            font-weight: 700;
        }
        .profile-badge.vip-active {
            background: linear-gradient(135deg, #fff7d6, #fde68a);
            color: #a16207;
            box-shadow: 0 6px 16px rgba(245, 158, 11, 0.18);
        }
        .profile-badge.vip-active i {
            color: #eab308;
            text-shadow: 0 0 8px rgba(234, 179, 8, 0.35);
        }
        .profile-badge-prefix {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #fff;
            font-size: 10px;
            font-weight: 700;
            line-height: 1;
            box-shadow: 0 2px 6px rgba(217, 119, 6, 0.28);
        }
        .profile-info-card .profile-info-item {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 0;
            border-bottom: 1px solid #eef2f7;
        }
        .profile-info-card .profile-info-item:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }
        .profile-info-card .profile-info-item:first-child {
            padding-top: 0;
        }
        .profile-info-label {
            color: #64748b;
            font-size: 14px;
        }
        .profile-info-value {
            color: #0f172a;
            font-size: 15px;
            font-weight: 700;
            text-align: right;
        }
        .profile-info-trigger {
            border: none;
            background: transparent;
            padding: 0;
            cursor: pointer;
        }
        .profile-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }
        .profile-actions .btn {
            border-radius: 18px;
            min-height: 48px;
            font-weight: 700;
        }
        .bottom-dock {
            position: fixed;
            left: 50%;
            bottom: 12px;
            transform: translateX(-50%);
            width: min(calc(100% - 20px), 420px);
            max-width: calc(100vw - 20px);
            background: rgba(255,255,255,0.98);
            border: 1px solid #e5e7eb;
            border-radius: 26px;
            padding: 12px 22px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
            z-index: 1050;
        }
        .dock-item {
            width: 48px;
            height: 48px;
            border: none;
            border-radius: 18px;
            background: transparent;
            color: #64748b;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }
        .dock-item.active:not(.dock-home) {
            background: #eef2ff;
            color: #4338ca;
        }
        .dock-home {
            width: 66px;
            height: 66px;
            margin-top: -34px;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: #fff;
            box-shadow: 0 18px 36px rgba(79, 70, 229, 0.32);
            font-size: 24px;
        }
        .footer {
            margin: 18px auto 0;
            max-width: 520px;
            padding: 0 18px 110px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
            line-height: 1.8;
        }
        .footer-inline-link {
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
        }
        .footer-inline-link:hover {
            color: #1d4ed8;
            text-decoration: underline;
        }
        .copyright-screenshot-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 12px;
        }
        .copyright-screenshot-preview-item {
            width: 72px;
            height: 72px;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .copyright-screenshot-preview-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        @media (min-width: 768px) {
            .hero-container {
                margin-top: 26px;
            }
            .mobile-card {
                padding: 24px 22px;
            }
        }
    </style>
</head>
<body>
        <div class="announcement-container alert alert-info mb-0 rounded-0">
        <div class="container"><i class="fa-solid fa-bullhorn me-2"></i>搜txt吧(sotxt8.com)：一个免费下载小说网文txt文件的平台，可自主搜索、社区求书，书友互助。  💖PS：苹果手机如果下载不了的话可尝试使用自带safari浏览器 ~</div>
    </div>
    
    <div class="hero-container">
                <div class="mobile-shell">
            <div class="app-page active" id="homePage">
                <div class="mobile-card home-header-card">
                    <div class="home-header-meta">
                        <button type="button" class="mini-chip mini-chip-action" onclick="openAuthorizationModal('upgrade')"><i class="fa-solid fa-shield-halved"></i>今日免费授权</button>
                        <h1>搜TXT吧</h1>
                        <p>sotxt8-全网小说免费搜索下载</p>
                    </div>
                    <button type="button" class="icon-action-btn" onclick="logoutSite()" aria-label="退出登录">
                        <i class="fa-solid fa-right-from-bracket"></i>
                    </button>
                </div>

                <div id="alertMessage" style="display:none;"></div>
                                
                
                
                <div class="mobile-card search-card-clean">
                    <div class="card-caption">资源搜索</div>
                    <form id="searchForm" onsubmit="return handleSearch(event)">
                        <div class="input-group input-group-lg">
                            <input type="text" id="searchInput" class="form-control" placeholder="请输入书名或作者名" value="" required>
                            <button class="btn btn-primary" type="submit">搜索</button>
                        </div>
                    </form>
                    <div class="search-helper">找不到想要的书可进入社区发帖求助书友！</div>
                    <div class="quick-entry-row">
                        <button type="button" class="quick-entry-btn" onclick="showHotSearches()">
                            <i class="fa-solid fa-fire"></i>
                            热门搜索
                        </button>
                        <button type="button" class="quick-entry-btn" onclick="openCommunityEntry()">
                            <i class="fa-solid fa-users"></i>
                            进入社区
                        </button>
                    </div>
                </div>

                
                <div id="loading-spinner" style="display:none; text-align:center; margin-top:20px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2 text-muted">正在努力搜索中，请稍候...</p>
                </div>
                <div id="searchResults"></div>
            </div>

            <div class="app-page " id="profilePage">
                <div class="mobile-card profile-card-clean">
                    <div class="profile-avatar-wrap">
                        <button type="button" class="profile-avatar-trigger" onclick="triggerAvatarUpload()" aria-label="更换头像">
                            <img src="assets/images/default-avatar.svg" alt="用户头像" class="profile-avatar-lg" id="profileAvatarImage">
                            <span class="profile-avatar-overlay">
                                <i class="fa-solid fa-camera"></i>
                                <span>更换头像</span>
                            </span>
                        </button>
                    </div>
                    <h2>qw1114</h2>
                    <div class="profile-badges">
                        <span class="profile-badge"><i class="fa-solid fa-user-shield"></i>普通书友</span>
                        <span class="profile-badge"><i class="fa-solid fa-crown"></i>非VIP</span>
                        <span class="profile-badge"><i class="fa-solid fa-coins"></i>5积分</span>
                    </div>
                </div>

                <div class="mobile-card profile-info-card">
                    <div class="card-caption">个人中心</div>
                    <div class="profile-info-item">
                        <span class="profile-info-label">站点授权</span>
                        <button type="button" class="profile-info-value profile-info-trigger" onclick="openAuthorizationModal('upgrade')">今日免费授权</button>
                    </div>
                    <div class="profile-info-item">
                        <span class="profile-info-label">授权有效期</span>
                        <span class="profile-info-value">2026-05-19 00:00</span>
                    </div>
                    <div class="profile-info-item">
                        <span class="profile-info-label">VIP有效期</span>
                        <span class="profile-info-value">未开通</span>
                    </div>
                    <div class="profile-info-item">
                        <span class="profile-info-label">邮箱</span>
                        <span class="profile-info-value">gifzazoqst@xghff.com</span>
                    </div>
                    <div class="profile-info-item">
                        <span class="profile-info-label">注册时间</span>
                        <span class="profile-info-value">2026-05-18</span>
                    </div>
                </div>

                <div class="mobile-card profile-info-card">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="card-caption mb-0">修改密码</div>
                        <button type="button" class="btn btn-outline-primary btn-sm rounded-pill" id="togglePasswordPanelBtn" onclick="togglePasswordPanel()" aria-expanded="false">展开</button>
                    </div>
                    <div id="changePasswordPanel" class="mt-3" style="display:none;">
                        <form id="changePasswordForm">
                            <input type="hidden" name="csrf_token" value="c8c927c9ac39ccf057504f77b5c78eae">
                            <div class="form-floating mb-3">
                                <input type="password" class="form-control" id="currentPassword" name="current_password" placeholder="当前密码" required>
                                <label for="currentPassword">当前密码</label>
                            </div>
                            <div class="form-floating mb-3">
                                <input type="password" class="form-control" id="newPassword" name="new_password" placeholder="新密码" required>
                                <label for="newPassword">新密码</label>
                            </div>
                            <div class="form-floating mb-3">
                                <input type="password" class="form-control" id="confirmNewPassword" name="confirm_password" placeholder="确认新密码" required>
                                <label for="confirmNewPassword">确认新密码</label>
                            </div>
                            <div class="small text-muted mb-3">为了账号安全，修改密码时需要先验证当前密码。新密码至少 6 位。</div>
                            <button type="submit" class="btn btn-outline-primary w-100 rounded-4">
                                <span class="btn-text">保存新密码</span>
                                <span class="loading"><i class="fa-solid fa-spinner fa-spin me-1"></i>提交中...</span>
                            </button>
                        </form>
                    </div>
                </div>

                
                <div class="profile-actions">
                    <button type="button" class="btn btn-outline-primary" onclick="openCommunityEntry()">进入社区</button>
                    <button type="button" class="btn btn-outline-secondary" onclick="logoutSite()">退出登录</button>
                </div>
            </div>
        </div>
            </div>

    <div class="bottom-dock">
        <button type="button" class="dock-item" data-dock="community" onclick="handleDockAction('community')" aria-label="社区">
            <i class="fa-solid fa-users"></i>
        </button>
        <button type="button" class="dock-item dock-home active" data-dock="home" onclick="handleDockAction('home')" aria-label="首页">
            <i class="fa-solid fa-house"></i>
        </button>
        <button type="button" class="dock-item " data-dock="profile" onclick="handleDockAction('profile')" aria-label="个人中心">
            <i class="fa-solid fa-user"></i>
        </button>
    </div>

    <button type="button" class="back-to-top-btn" id="backToTopButton" aria-label="返回顶部" onclick="scrollPageToTop()">
        <i class="fa-solid fa-arrow-up"></i>
    </button>

    <footer class="footer">
        本站所有资源内容来源于网络，版权归版权方所有，如有侵权请留言告知删除。下载者仅可用于学习研究，请勿用于非法用途或传播，否则后果自负。权利人如发现侵权资源，可提交资料处理，<a href="javascript:void(0)" class="footer-inline-link" onclick="openCopyrightReportModal()">点击提交</a>
    </footer>

    <div class="modal fade" id="copyrightReportModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 rounded-4">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title"><i class="fa-solid fa-shield-halved me-2"></i>侵权资料提交</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pt-3">
                    <div class="auth-modal-note">请填写侵权关键词、1到3张版权截图和邮箱，关键词支持多条，站长会在后台查看后处理。</div>
                    <div id="copyrightReportMessage" class="alert border-0 rounded-4" style="display:none;"></div>
                    <form id="copyrightReportForm" enctype="multipart/form-data">
                        <input type="hidden" name="csrf_token" value="c8c927c9ac39ccf057504f77b5c78eae">
                        <div class="mb-3">
                            <label for="copyrightKeywordInput" class="form-label fw-semibold">侵权关键词</label>
                            <textarea class="form-control" id="copyrightKeywordInput" name="keyword" rows="3" placeholder="一行一个关键词，例如：&#10;书名&#10;作者名" required></textarea>
                            <div class="form-text">支持多个关键词，建议一行填写一个。</div>
                        </div>
                        <div class="mb-3">
                            <label for="copyrightScreenshotsInput" class="form-label fw-semibold">版权截图（1到3张）</label>
                            <input type="file" class="form-control" id="copyrightScreenshotsInput" name="screenshots[]" accept="image/jpeg,image/png,image/webp,image/gif" multiple required>
                            <div class="form-text">支持 JPG、PNG、WEBP、GIF，单张不超过 5MB。</div>
                            <div class="copyright-screenshot-preview" id="copyrightScreenshotPreview"></div>
                        </div>
                        <div class="mb-3">
                            <label for="copyrightEmailInput" class="form-label fw-semibold">邮箱</label>
                            <input type="email" class="form-control" id="copyrightEmailInput" name="email" value="" placeholder="请填写提交者邮箱，方便处理后邮件通知" required>
                        </div>
                        <button type="submit" class="btn btn-primary w-100 rounded-4">
                            <span class="btn-text">提交资料</span>
                            <span class="loading" style="display:none;"><i class="fa-solid fa-spinner fa-spin me-1"></i>提交中...</span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="authorizationModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 rounded-4">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title"><i class="fa-solid fa-shield-halved me-2"></i>开启站点授权</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pt-3">
                    <div class="auth-modal-note">
                        每位用户都可以<strong>每日免费领取当天授权码</strong>，不是强制消费。开启授权后即可使用搜索功能并进入社区互动。
                    </div>
                    <div class="mb-3 small text-muted" id="authorizationReasonText">当前操作需要先开启站点授权。</div>
                                                            <form method="post" action="/index.php" class="mb-3">
                        <input type="hidden" name="csrf_token" value="c8c927c9ac39ccf057504f77b5c78eae">
                        <label for="authCodeInput" class="form-label fw-semibold">输入当天免费授权码</label>
                        <input type="text" class="form-control mb-2" id="authCodeInput" name="auth_code" placeholder="请输入当天授权码">
                        <button type="submit" class="btn btn-primary w-100 rounded-4">开启今日免费授权</button>
                    </form>
                    <div class="d-flex flex-column gap-2 mb-3">
                                                <a href="https://pan.quark.cn/s/e3fe7f97a052" target="_blank" class="btn btn-danger rounded-4" id="latestAuthLinkButton" data-fallback-url="https://pan.quark.cn/s/e3fe7f97a052">
                            <span id="latestAuthLinkText">免费获取今日授权码</span>
                        </a>
                        <div class="small text-muted" id="authLinkStatusMessage" style="display:none;"></div>
                    </div>
                    <hr>
                    <form method="post" action="/index.php">
                        <input type="hidden" name="csrf_token" value="c8c927c9ac39ccf057504f77b5c78eae">
                        <label for="paidCardCodeInput" class="form-label fw-semibold">输入付费授权卡密</label>
                        <input type="text" class="form-control mb-2" id="paidCardCodeInput" name="paid_card_code" placeholder="使用长效授权码，省去每日重复获取">
                        <button type="submit" class="btn btn-dark w-100 rounded-4">激活付费授权卡密</button>
                    </form>
                                        <div class="mt-3">
                        <a href="https://pay.ldxp.cn/shop/E8JTLT33" target="_blank" class="btn btn-outline-primary w-100 rounded-4">
                            <i class="fa-solid fa-cart-shopping me-2"></i>购买周卡/月卡/季卡/年卡/永久卡                        </a>
                    </div>
                                        <div class="mt-3">
                                            <a href="promotion_task.php" class="btn btn-outline-danger w-100 rounded-4">
                            <i class="fa-solid fa-bullhorn me-2"></i>免费获取长效授权
                        </a>
                                        </div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="hotSearchModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-fire me-2 text-danger"></i>热门搜索</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="hotSearchContent">
                    <div class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">加载中...</span>
                        </div>
                        <p class="mt-2 text-muted">正在加载热门搜索...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="/assets/js/bootstrap.bundle.min.js" defer></script>
    <script src="/assets/js/lanzou_search.js?v=1778937558" defer></script>
    <script>
        const SITE_IS_LOGGED_IN = true;
        const SITE_HAS_AUTHORIZATION = true;
        const SITE_CSRF_TOKEN = "c8c927c9ac39ccf057504f77b5c78eae";
        let SITE_SEARCH_REQUEST_TOKEN = "476050b9131cb367cc9f0d4475d3743b";
        const SITE_ENABLED_SEARCH_MODES = ["share","pan89","nailong"];
        const SITE_INITIAL_TAB = 'home';
        let authorizationModalInstance = null;
        let authLinkRefreshTimer = null;
        let copyrightReportModalInstance = null;

        function setAuthLinkStatus(message, type) {
            const statusElement = document.getElementById('authLinkStatusMessage');
            if (!statusElement) {
                return;
            }
            if (!message) {
                statusElement.style.display = 'none';
                statusElement.textContent = '';
                statusElement.className = 'small text-muted';
                return;
            }
            statusElement.style.display = 'block';
            statusElement.textContent = message;
            statusElement.className = type === 'danger' ? 'small text-danger' : (type === 'success' ? 'small text-success' : (type === 'warning' ? 'small text-warning' : 'small text-muted'));
        }

        function stopAuthLinkPolling() {
            if (authLinkRefreshTimer) {
                window.clearTimeout(authLinkRefreshTimer);
                authLinkRefreshTimer = null;
            }
        }

        function scheduleAuthLinkRefresh() {
            stopAuthLinkPolling();
            authLinkRefreshTimer = window.setTimeout(() => {
                refreshLatestAuthLink({ poll: true });
            }, 5000);
        }

        async function refreshLatestAuthLink(options) {
            const shouldPoll = !!(options && options.poll);
            const authLinkButton = document.getElementById('latestAuthLinkButton');
            const authLinkText = document.getElementById('latestAuthLinkText');
            if (!authLinkButton) {
                return false;
            }

            authLinkButton.classList.add('disabled');
            authLinkButton.removeAttribute('href');
            if (authLinkText) {
                authLinkText.textContent = '免费授权码正在更新中';
            }
            setAuthLinkStatus('免费授权码正在更新中，请稍候，本窗口会自动刷新获取入口。', 'warning');

            try {
                const response = await fetch('auth.php?action=get_latest_auth_link&_t=' + Date.now(), {
                    cache: 'no-store'
                });
                if (!response.ok) {
                    throw new Error('获取最新链接失败');
                }

                const data = await response.json();
                if (!data.success || !data.auth_link_url) {
                    setAuthLinkStatus(data.message || '免费授权码正在更新中，请稍候，本窗口会自动刷新获取入口。', 'warning');
                    authLinkButton.removeAttribute('href');
                    authLinkButton.classList.add('disabled');
                    if (authLinkText) {
                        authLinkText.textContent = '免费授权码正在更新中';
                    }
                    if (shouldPoll) {
                        scheduleAuthLinkRefresh();
                    }
                    return false;
                }

                authLinkButton.href = data.auth_link_url;
                authLinkButton.setAttribute('data-fallback-url', data.auth_link_url);
                authLinkButton.classList.remove('disabled');
                if (authLinkText) {
                    authLinkText.textContent = data.auth_link_text || '免费获取今日授权码';
                }
                setAuthLinkStatus('已同步到最新链接', 'success');
                stopAuthLinkPolling();
                return true;
            } catch (error) {
                setAuthLinkStatus('授权码入口暂时获取失败，正在重试...', 'warning');
                authLinkButton.classList.add('disabled');
                if (authLinkText) {
                    authLinkText.textContent = '免费授权码正在更新中';
                }
                if (shouldPoll) {
                    scheduleAuthLinkRefresh();
                }
                return false;
            }
        }

        function showAlert(message, type) {
            const alertBox = document.getElementById('alertMessage');
            if (!alertBox) {
                return;
            }
            if (!message) {
                alertBox.style.display = 'none';
                alertBox.innerHTML = '';
                return;
            }
            alertBox.className = `alert alert-${type || 'info'} border-0 rounded-4`;
            alertBox.innerHTML = message;
            alertBox.style.display = 'block';
        }

        function setButtonLoading(button, loading) {
            if (!button) {
                return;
            }
            const text = button.querySelector('.btn-text');
            const spinner = button.querySelector('.loading');
            button.disabled = loading;
            if (text) {
                text.style.display = loading ? 'none' : 'inline';
            }
            if (spinner) {
                spinner.style.display = loading ? 'inline' : 'none';
            }
        }

        function calculateUsernameLength(username) {
            let length = 0;
            for (const char of username) {
                const code = char.codePointAt(0);
                length += (code >= 0x4e00 && code <= 0x9fff) ? 2 : 1;
            }
            return length;
        }

        function focusAuthCard(tabName) {
            const authCard = document.getElementById('authCard');
            if (tabName === 'register') {
                const registerTab = document.getElementById('register-tab');
                if (registerTab) {
                    registerTab.click();
                }
            } else {
                const loginTab = document.getElementById('login-tab');
                if (loginTab) {
                    loginTab.click();
                }
            }
            if (authCard) {
                authCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        function setDockActive(target) {
            document.querySelectorAll('.dock-item').forEach(item => {
                item.classList.toggle('active', item.dataset.dock === target);
            });
        }

        function switchAppPage(target) {
            const homePage = document.getElementById('homePage');
            const profilePage = document.getElementById('profilePage');
            if (!homePage || !profilePage) {
                setDockActive('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            const showProfile = target === 'profile';
            homePage.classList.toggle('active', !showProfile);
            profilePage.classList.toggle('active', showProfile);
            setDockActive(showProfile ? 'profile' : 'home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function updateBackToTopButtonVisibility() {
            const backToTopButton = document.getElementById('backToTopButton');
            if (!backToTopButton) {
                return;
            }
            backToTopButton.classList.toggle('show', window.scrollY > 260);
        }

        function scrollPageToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function handleDockAction(target) {
            if (target === 'community') {
                openCommunityEntry();
                return;
            }
            if (!SITE_IS_LOGGED_IN) {
                setDockActive('home');
                focusAuthCard('login');
                return;
            }
            switchAppPage(target);
        }

        function openAuthorizationModal(reason) {
            const modalElement = document.getElementById('authorizationModal');
            if (!modalElement) {
                return;
            }
            if (!authorizationModalInstance) {
                authorizationModalInstance = new bootstrap.Modal(modalElement);
            }
            const reasonText = document.getElementById('authorizationReasonText');
            if (reasonText) {
                if (reason === 'upgrade') {
                    reasonText.textContent = '你当前已开启站点授权，可继续输入付费授权码升级为长效授权。';
                } else if (reason === 'community') {
                    reasonText.textContent = '进入社区互动前，需要先开启站点授权。';
                } else {
                    reasonText.textContent = '使用搜索功能前，需要先开启站点授权。';
                }
            }
            refreshLatestAuthLink({ poll: true });
            authorizationModalInstance.show();
        }

        function showCopyrightReportMessage(message, type) {
            const messageBox = document.getElementById('copyrightReportMessage');
            if (!messageBox) {
                return;
            }
            if (!message) {
                messageBox.style.display = 'none';
                messageBox.innerHTML = '';
                return;
            }
            messageBox.className = `alert alert-${type || 'info'} border-0 rounded-4`;
            messageBox.textContent = message;
            messageBox.style.display = 'block';
        }

        function renderCopyrightScreenshotPreview(files) {
            const preview = document.getElementById('copyrightScreenshotPreview');
            if (!preview) {
                return;
            }
            preview.innerHTML = '';
            Array.from(files || []).slice(0, 3).forEach(file => {
                const reader = new FileReader();
                reader.onload = function (event) {
                    const item = document.createElement('div');
                    item.className = 'copyright-screenshot-preview-item';
                    const image = document.createElement('img');
                    image.src = String(event.target && event.target.result ? event.target.result : '');
                    image.alt = file.name || '截图预览';
                    item.appendChild(image);
                    preview.appendChild(item);
                };
                reader.readAsDataURL(file);
            });
        }

        function openCopyrightReportModal() {
            const modalElement = document.getElementById('copyrightReportModal');
            if (!modalElement) {
                return;
            }
            if (!copyrightReportModalInstance) {
                copyrightReportModalInstance = new bootstrap.Modal(modalElement);
            }
            showCopyrightReportMessage('', 'info');
            copyrightReportModalInstance.show();
        }

        function logoutSite() {
            const formData = new FormData();
            formData.append('action', 'logout');
            formData.append('csrf_token', SITE_CSRF_TOKEN);
            fetch('community_auth.php', {
                method: 'POST',
                body: formData
            }).then(() => {
                window.location.reload();
            }).catch(() => {
                window.location.reload();
            });
        }

        function triggerAvatarUpload() {
            const cropperWindow = window.open(
                'avatar_cropper.php',
                'avatarCropper',
                'width=700,height=600,scrollbars=yes,resizable=yes,status=no,location=no,menubar=no,toolbar=no'
            );
            if (!cropperWindow) {
                showAlert('无法打开头像编辑器，请检查浏览器弹窗设置', 'danger');
            }
        }

        function togglePasswordPanel(forceOpen = null) {
            const panel = document.getElementById('changePasswordPanel');
            const toggleButton = document.getElementById('togglePasswordPanelBtn');
            if (!panel || !toggleButton) {
                return;
            }
            const isCurrentlyOpen = panel.style.display !== 'none';
            const shouldOpen = forceOpen === null ? !isCurrentlyOpen : !!forceOpen;
            panel.style.display = shouldOpen ? 'block' : 'none';
            toggleButton.textContent = shouldOpen ? '收起' : '展开';
            toggleButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        }

        function updateAvatarDisplay(avatarUrl) {
            const avatarImg = document.getElementById('profileAvatarImage');
            if (avatarImg) {
                avatarImg.src = avatarUrl + '?t=' + Date.now();
            }
        }

        function handleSearch(event) {
            event.preventDefault();
            const keyword = document.getElementById('searchInput').value.trim();
            if (!keyword) {
                return false;
            }
            if (!SITE_HAS_AUTHORIZATION) {
                openAuthorizationModal('search');
                return false;
            }
            const resultContainer = document.getElementById('searchResults');
            const loadingSpinner = document.getElementById('loading-spinner');
            performSearch(keyword, resultContainer, loadingSpinner);
            return false;
        }

        function openCommunityEntry() {
            if (!SITE_IS_LOGGED_IN) {
                focusAuthCard('login');
                return;
            }
            if (!SITE_HAS_AUTHORIZATION) {
                openAuthorizationModal('community');
                return;
            }
            window.location.href = 'community.php';
        }

        function openCommunityNotifications() {
            if (!SITE_IS_LOGGED_IN) {
                focusAuthCard('login');
                return;
            }
            if (!SITE_HAS_AUTHORIZATION) {
                openAuthorizationModal('community');
                return;
            }
            window.location.href = 'notifications.php';
        }

        function showHotSearches() {
            const modal = new bootstrap.Modal(document.getElementById('hotSearchModal'));
            modal.show();
            loadHotSearches();
        }

        function loadHotSearches() {
            const content = document.getElementById('hotSearchContent');
            content.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div><p class="mt-2 text-muted">正在加载热门搜索...</p></div>';
            fetch('api_hot_search.php?action=list&_t=' + Date.now(), {
                cache: 'no-store',
                credentials: 'same-origin'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('网络响应错误');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        displayHotSearches(data.data || []);
                    } else {
                        content.innerHTML = '<div class="alert alert-warning">加载失败，请稍后重试</div>';
                    }
                })
                .catch(error => {
                    content.innerHTML = '<div class="alert alert-danger">加载失败：' + error.message + '</div>';
                });
        }

        function displayHotSearches(items) {
            const content = document.getElementById('hotSearchContent');
            if (!items || items.length === 0) {
                content.innerHTML = '<div class="alert alert-info rounded-4 mb-0">暂无热门搜索。热门搜索只统计最近7天内有搜索结果的关键词。</div>';
                return;
            }
            let html = '<div class="small text-muted mb-3">以下关键词来自最近7天内有结果的用户搜索，无结果关键词不会进入热门榜。</div><div class="list-group list-group-flush">';
            items.forEach((item, index) => {
                const keyword = escapeHtml(item.keyword || '');
                const count = Number(item.count || 0);
                html += `
                    <a href="javascript:void(0)" onclick="searchHotKeyword('${keyword.replace(/'/g, '&#39;')}')" class="list-group-item list-group-item-action d-flex align-items-center justify-content-between rounded-3 mb-2 border">
                        <span><span class="badge bg-primary rounded-pill me-2">${index + 1}</span><i class="fa-solid fa-magnifying-glass me-2 text-primary"></i>${keyword}</span>
                        <span class="text-danger small fw-semibold">${count} <i class="fa-solid fa-fire"></i></span>
                    </a>
                `;
            });
            html += '</div>';
            content.innerHTML = html;
        }

        function searchHotKeyword(keyword) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('hotSearchModal'));
            if (modal) {
                modal.hide();
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = keyword;
            }
            if (!SITE_HAS_AUTHORIZATION) {
                openAuthorizationModal('search');
                return;
            }
            const resultContainer = document.getElementById('searchResults');
            const loadingSpinner = document.getElementById('loading-spinner');
            performSearch(keyword, resultContainer, loadingSpinner);
        }

        function searchNovel(novelName) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('hotSearchModal'));
            if (modal) {
                modal.hide();
            }
            let searchTerm = novelName;
            const bookNameMatch = novelName.match(/[《<][^》>]+[》>]/);
            if (bookNameMatch) {
                searchTerm = bookNameMatch[0].trim();
            }
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = searchTerm;
            }
            if (!SITE_HAS_AUTHORIZATION) {
                openAuthorizationModal('search');
                return;
            }
            const resultContainer = document.getElementById('searchResults');
            const loadingSpinner = document.getElementById('loading-spinner');
            performSearch(searchTerm, resultContainer, loadingSpinner);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function (event) {
                event.preventDefault();
                const formData = new FormData(loginForm);
                formData.append('action', 'login');
                const submitBtn = loginForm.querySelector('button[type="submit"]');
                setButtonLoading(submitBtn, true);
                fetch('community_auth.php', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                  .then(data => {
                      setButtonLoading(submitBtn, false);
                      if (!data.success) {
                          showAlert(data.message || '登录失败', 'danger');
                          return;
                      }
                      window.location.reload();
                  }).catch(() => {
                      setButtonLoading(submitBtn, false);
                      showAlert('网络错误，请重试', 'danger');
                  });
            });
        }

        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', function (event) {
                event.preventDefault();
                const username = document.getElementById('registerUsername').value.trim();
                const password = document.getElementById('registerPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                if (calculateUsernameLength(username) < 4 || calculateUsernameLength(username) > 10) {
                    showAlert('用户名长度必须在4-10个字符之间（中文算2个字符）', 'danger');
                    return;
                }
                if (password.length < 6) {
                    showAlert('密码长度不能少于6位', 'danger');
                    return;
                }
                if (password !== confirmPassword) {
                    showAlert('两次输入的密码不一致', 'danger');
                    return;
                }
                const formData = new FormData(registerForm);
                formData.append('action', 'register');
                const submitBtn = registerForm.querySelector('button[type="submit"]');
                setButtonLoading(submitBtn, true);
                fetch('community_auth.php', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                  .then(data => {
                      setButtonLoading(submitBtn, false);
                      if (!data.success) {
                          showAlert(data.message || '注册失败', 'danger');
                          return;
                      }
                      showAlert(data.message || '注册成功，请登录', 'success');
                      setTimeout(() => {
                          const loginTab = document.getElementById('login-tab');
                          if (loginTab) {
                              loginTab.click();
                          }
                          const loginUsername = document.getElementById('loginUsername');
                          if (loginUsername) {
                              loginUsername.value = username;
                          }
                      }, 800);
                  }).catch(() => {
                      setButtonLoading(submitBtn, false);
                      showAlert('网络错误，请重试', 'danger');
                  });
            });
        }

        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', function (event) {
                event.preventDefault();
                const username = document.getElementById('forgotUsername').value.trim();
                const email = document.getElementById('forgotEmail').value.trim();
                const newPassword = document.getElementById('forgotNewPassword').value;
                const confirmPassword = document.getElementById('forgotConfirmPassword').value;
                if (!username || !email || !newPassword || !confirmPassword) {
                    showAlert('请完整填写账号、邮箱和新密码', 'danger');
                    return;
                }
                if (newPassword.length < 6) {
                    showAlert('新密码长度不能少于6位', 'danger');
                    return;
                }
                if (newPassword !== confirmPassword) {
                    showAlert('两次输入的新密码不一致', 'danger');
                    return;
                }
                const formData = new FormData(forgotPasswordForm);
                formData.append('action', 'reset_password_by_email');
                const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');
                setButtonLoading(submitBtn, true);
                fetch('community_auth.php', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                  .then(data => {
                      setButtonLoading(submitBtn, false);
                      if (!data.success) {
                          showAlert(data.message || '密码重置失败', 'danger');
                          return;
                      }
                      showAlert(data.message || '密码重置成功，请登录', 'success');
                      forgotPasswordForm.reset();
                      setTimeout(() => {
                          const loginTab = document.getElementById('login-tab');
                          if (loginTab) {
                              loginTab.click();
                          }
                          const loginUsername = document.getElementById('loginUsername');
                          if (loginUsername) {
                              loginUsername.value = username;
                          }
                      }, 800);
                  }).catch(() => {
                      setButtonLoading(submitBtn, false);
                      showAlert('网络错误，请重试', 'danger');
                  });
            });
        }

        const changePasswordForm = document.getElementById('changePasswordForm');
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', function (event) {
                event.preventDefault();
                togglePasswordPanel(true);
                const currentPassword = document.getElementById('currentPassword').value;
                const newPassword = document.getElementById('newPassword').value;
                const confirmNewPassword = document.getElementById('confirmNewPassword').value;
                if (!currentPassword || !newPassword || !confirmNewPassword) {
                    showAlert('请完整填写密码信息', 'danger');
                    return;
                }
                if (newPassword.length < 6) {
                    showAlert('新密码长度不能少于6位', 'danger');
                    return;
                }
                if (newPassword !== confirmNewPassword) {
                    showAlert('两次输入的新密码不一致', 'danger');
                    return;
                }
                if (currentPassword === newPassword) {
                    showAlert('新密码不能与当前密码相同', 'danger');
                    return;
                }
                const formData = new FormData(changePasswordForm);
                formData.append('action', 'change_password');
                const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
                setButtonLoading(submitBtn, true);
                fetch('community_auth.php', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                  .then(data => {
                      setButtonLoading(submitBtn, false);
                      if (!data.success) {
                          showAlert(data.message || '密码修改失败', 'danger');
                          return;
                      }
                      changePasswordForm.reset();
                      showAlert(data.message || '密码修改成功', 'success');
                      if (data.require_relogin) {
                          window.setTimeout(() => {
                              window.location.reload();
                          }, 1200);
                          return;
                      }
                      switchAppPage('profile');
                  }).catch(() => {
                      setButtonLoading(submitBtn, false);
                      showAlert('网络错误，请重试', 'danger');
                  });
            });
        }

        const copyrightScreenshotsInput = document.getElementById('copyrightScreenshotsInput');
        if (copyrightScreenshotsInput) {
            copyrightScreenshotsInput.addEventListener('change', function () {
                const files = Array.from(this.files || []);
                if (files.length > 3) {
                    this.value = '';
                    renderCopyrightScreenshotPreview([]);
                    showCopyrightReportMessage('最多只能上传3张版权截图', 'danger');
                    return;
                }
                showCopyrightReportMessage('', 'info');
                renderCopyrightScreenshotPreview(files);
            });
        }

        const copyrightReportForm = document.getElementById('copyrightReportForm');
        if (copyrightReportForm) {
            copyrightReportForm.addEventListener('submit', function (event) {
                event.preventDefault();
                const screenshotInput = document.getElementById('copyrightScreenshotsInput');
                const files = Array.from((screenshotInput && screenshotInput.files) || []);
                if (files.length < 1 || files.length > 3) {
                    showCopyrightReportMessage('请上传1到3张版权截图', 'danger');
                    return;
                }

                const submitBtn = copyrightReportForm.querySelector('button[type="submit"]');
                const formData = new FormData(copyrightReportForm);
                setButtonLoading(submitBtn, true);
                showCopyrightReportMessage('', 'info');

                fetch('copyright_report_api.php', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                  .then(data => {
                      setButtonLoading(submitBtn, false);
                      if (!data.success) {
                          showCopyrightReportMessage(data.message || '提交失败，请稍后重试', 'danger');
                          return;
                      }
                      showCopyrightReportMessage(data.message || '资料已提交', 'success');
                      copyrightReportForm.reset();
                      renderCopyrightScreenshotPreview([]);
                      window.setTimeout(() => {
                          if (copyrightReportModalInstance) {
                              copyrightReportModalInstance.hide();
                          }
                      }, 1200);
                  }).catch(() => {
                      setButtonLoading(submitBtn, false);
                      showCopyrightReportMessage('网络错误，请稍后重试', 'danger');
                  });
            });
        }

        document.addEventListener('DOMContentLoaded', function () {
            const authorizationModalElement = document.getElementById('authorizationModal');
            if (authorizationModalElement) {
                authorizationModalElement.addEventListener('hidden.bs.modal', stopAuthLinkPolling);
            }
        });

                        document.addEventListener('DOMContentLoaded', function () {
            if (SITE_INITIAL_TAB === 'profile') {
                switchAppPage('profile');
            } else {
                setDockActive('home');
            }
            updateBackToTopButtonVisibility();
        });
                window.addEventListener('scroll', updateBackToTopButtonVisibility, { passive: true });
    </script>
</body>
</html>
