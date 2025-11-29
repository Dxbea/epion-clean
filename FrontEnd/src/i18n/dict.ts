// src/i18n/dict.ts
export const DICT = {
  en: {
    // ───────────────── NAV
    nav_home: "Home",
    nav_chat: "Chat",
    nav_actuality: "Actuality",
    nav_download: "Download epion",
    menu_my_account: "My account",
    menu_settings: "Settings",
    close: "Close",

    // ───────────────── HOME
    home_title: "Your guide to clearer, smarter information.\nCheck. Learn. Talk.",
    home_lead: "Epion is a new kind of media — modular, AI‑powered, and fact-first.",
    cta_chat: "Try talking with Epion",
    cta_articles: "Look at our articles",

    // ───────────────── SETTINGS (shell)
    settings_title: "Settings",
    settings_lead: "Adjust your preferences.",
    general: "General",
    general_desc: "Theme and interface language.",
    account: "Account",
    account_desc: "Manage your profile info.",
    security: "Security",
    twofa: "Two‑factor (soon)",
    sessions: "Active sessions",
    notifications: "Notifications",
    notifications_desc: "Choose how Epion keeps you informed.",
    privacy: "Privacy",
    privacy_desc: "Control visibility and analytics.",
    data: "Data & compliance",
    accessibility: "Accessibility",
    jump_to: "Jump to",

    // ───────────────── GENERAL
    theme: "Theme",
    theme_desc: "Switch between light and dark mode.",
    language: "Language",
    language_desc: "Choose your interface language.",
    changes_apply_immediately: "Changes apply immediately.",

    // ───────────────── NOTIFICATIONS
    notif_email_news: "Product updates by email",
    notif_email_news_desc: "Major updates and announcements.",
    notif_email_mentions: "Mentions / replies by email",
    notif_email_mentions_desc: "When someone interacts with you.",
    notif_push_all: "Push notifications",
    notif_push_all_desc: "Receive notifications on this device.",

    // ───────────────── PRIVACY
    profile_visibility: "Profile visibility (coming soon)",
    profile_visibility_desc: "This will enable public profile visibility when profiles are available.",
    visibility_public: "Public",
    visibility_private: "Private",
    analytics_tracking: "Analytics tracking",
    analytics_tracking_desc: "Epion tracks nothing by default. You may allow anonymous analytics.",
    analytics_allow: "Allow anonymous tracking",

    // ───────────────── ACCOUNT
    my_account: "My Account",
    my_account_lead: "Manage your profile and information.",
    profile_info: "Profile",
    profile_info_desc: "Name, handle, phone and photo.",
    email: "Email",
    verified: "Verified",
    unverified: "Unverified",
    resend: "Resend email",
    sending: "Sending…",
    resend_sent: "Verification email sent.",
    display_name: "Display name",
    username: "Username",
    username_help: "3–20 chars, letters/numbers/underscore only.",
    username_required: "Username is required.",
    username_error: "Use 3–20 chars (A-Z, 0-9, _).",
    avatar: "Avatar",
    avatar_desc: "Upload a square image. Cropping coming soon.",
    no_photo: "No photo",
    change: "Change",
    remove: "Remove",
    account_short_desc: "Manage your email and account status.",
    account_short_hint: "Verify your email and manage quick security actions.",
    forgot_password: "Forgot password?",

    // ───────────────── SECURITY
    security_desc: "Change your password. 2FA arrives soon.",
    current_password: "Current password",
    new_password: "New password",
    confirm_password: "Confirm new password",
    password_rules: "At least 8 chars, 1 upper, 1 lower, 1 number, 1 special.",
    password_rules_short: "Password too weak",
    password_mismatch: "Passwords do not match.",

    // Shortcuts (Account page)
    security_shortcuts_desc: "Shortcuts to security settings.",
    change_password: "Change password",
    change_password_desc: "Update your current password.",
    go_to_security: "Go to security",
    sessions_short_desc: "See connected devices.",
    go_to_sessions: "Go to sessions",

    // ───────────────── SESSIONS
    sessions_desc: "Sign out other devices.",
    this_device: "This device",
    last_active: "Last active",
    revoke: "Revoke",
    no_other_sessions: "No other sessions.",
    revoke_all_others: "Revoke all other sessions",
    sessions_refresh: "Refresh",
    sessions_refreshed: "Sessions up to date.",
    revoke_all_others_btn: "Sign out of other sessions",
    revoke_all_done: "Signed out of other sessions.",
    revoke_all_failed: "Failed to revoke sessions.",

    // ───────────────── TWOFA
    twofa_desc: "Secure your account with an authenticator app (coming soon).",
    not_available_yet: "Not available yet.",
    enable_2fa_soon: "Enable 2FA (soon)",

    // ───────────────── DATA / COMPLIANCE
    data_desc: "Export your local data or delete your account from this device.",
    export_json: "Export my data (JSON)",
    delete_account: "Delete my account",
    delete_confirm: "Delete your local data? This cannot be undone.",
    deleted_local: "Local data deleted. (No server call performed.)",

    // ───────────────── ACCESSIBILITY
    accessibility_desc: "Make Epion easier to read.",
    a11y_larger_text: "Larger text",
    a11y_larger_text_desc: "Increase base text size for better readability.",
    a11y_higher_contrast: "Higher contrast",
    a11y_higher_contrast_desc: "Slightly increase UI contrast.",

    // ───────────────── BILLING (placeholders)
    billing: "Billing",
    billing_desc: "Your plan and renewal (coming soon).",
    current_plan: "Current plan",
    next_billing: "Next billing",
    manage_billing: "Manage subscription",
    view_invoices: "View invoices",

    // ───────────────── COMMON
    save: "Save",
    cancel: "Cancel",
    saved: "Saved",
    required: "Required",
    saving: "Saving…",

    // nav
    actuality: "Actuality",
    download: "Download",
    changelog: "Changelog",
    guide: "Guide",
    blog: "Blog",
    transparency: "Our transparency",
    contact: "Contact",
    moderation_policy: "Moderation policy",
    press: "Press",
    cookies: "Cookies",

    // Download
    download_title: "Download Epion",
    download_lead: "Desktop and mobile apps are coming soon.",
    download_desktop: "Download for desktop",
    download_mobile: "Get mobile app",

    // Changelog
    changelog_title: "Changelog",
    changelog_lead: "What changed, and when.",
    changelog_stub: "Initial public pages added.",

    // Guide
    guide_title: "User guide",
    guide_lead: "How to get the most from Epion.",
    guide_block_1: "Search and read articles with clear sections.",
    guide_block_2: "Ask Epion in chat for summaries and sources.",

    // Blog
    blog_title: "Epion Blog",
    blog_lead: "Notes and updates from the team.",
    blog_stub: "No post yet. Stay tuned.",

    // Transparency
    transparency_title: "Our transparency",
    transparency_lead: "How we source, rank and fund.",
    transparency_sources: "Sources: reputable outlets and verified feeds.",
    transparency_funding: "Funding: currently self-funded; details soon.",

    // Contact
    contact_title: "Contact us",
    contact_lead: "Questions, feedback, partnerships.",
    contact_name: "Your name",
    contact_email: "Your email",
    contact_message: "Your message",
    contact_send: "Send",


    // Moderation
    moderation_title: "Moderation policy",
    moderation_lead: "Clear rules to keep conversations constructive.",
    moderation_stub: "High-level rules placeholder. Full policy soon.",

    // Press
    press_title: "Press",
    press_lead: "Press inquiries and materials.",
    press_stub: "Media kit and press contacts will be available here.",
    press_kit: "Download press kit",

    // Cookies
    cookies_title: "Cookies",
    cookies_lead: "How and why we use cookies.",
    cookies_stub: "We use only essential cookies at this stage.",


    
  },

  

  fr: {
    // ───────────────── NAV
    nav_home: "Accueil",
    nav_chat: "Chat",
    nav_actuality: "Actualité",
    nav_download: "Télécharger epion",
    menu_my_account: "Mon compte",
    menu_settings: "Paramètres",
    close: "Fermer",

    // ───────────────── HOME
    home_title: "Votre guide vers une information plus claire et plus intelligente.\nVérifie. Comprends. Discute.",
    home_lead: "Epion est un nouveau type de média — modulaire, propulsé par l'IA et fondé sur les faits.",
    cta_chat: "Essayer la conversation",
    cta_articles: "Voir les articles",

    // ───────────────── SETTINGS (shell)
    settings_title: "Paramètres",
    settings_lead: "Ajustez vos préférences.",
    general: "Général",
    general_desc: "Thème et langue de l'interface.",
    account: "Compte",
    account_desc: "Gérez vos informations de profil.",
    security: "Sécurité",
    twofa: "Double authentification (bientôt)",
    sessions: "Sessions actives",
    notifications: "Notifications",
    notifications_desc: "Choisissez comment Epion vous informe.",
    privacy: "Confidentialité",
    privacy_desc: "Contrôlez la visibilité et la mesure d'audience.",
    data: "Données & conformité",
    accessibility: "Accessibilité",
    jump_to: "Aller à",

    // ───────────────── GENERAL
    theme: "Thème",
    theme_desc: "Basculer entre le mode clair et sombre.",
    language: "Langue",
    language_desc: "Choisissez la langue de l'interface.",
    changes_apply_immediately: "Les changements s'appliquent immédiatement.",

    // ───────────────── NOTIFICATIONS
    notif_email_news: "Nouveautés produit par email",
    notif_email_news_desc: "Mises à jour majeures et annonces.",
    notif_email_mentions: "Mentions / réponses par email",
    notif_email_mentions_desc: "Quand quelqu'un interagit avec vous.",
    notif_push_all: "Notifications push",
    notif_push_all_desc: "Recevoir les notifications sur cet appareil.",

    // ───────────────── PRIVACY
    profile_visibility: "Visibilité du profil (bientôt)",
    profile_visibility_desc: "Activera la visibilité publique lorsque les profils seront disponibles.",
    visibility_public: "Public",
    visibility_private: "Privé",
    analytics_tracking: "Mesure d'audience",
    analytics_tracking_desc: "Epion ne trace rien par défaut. Vous pouvez autoriser un suivi anonyme.",
    analytics_allow: "Autoriser le suivi anonyme",

    // ───────────────── ACCOUNT
    my_account: "Mon compte",
    my_account_lead: "Gérez votre profil et vos informations.",
    profile_info: "Profil",
    profile_info_desc: "Nom, pseudo, téléphone et photo.",
    email: "E-mail",
    verified: "Vérifié",
    unverified: "Non vérifié",
    resend: "Renvoyer l'email",
    sending: "Envoi…",
    resend_sent: "Email de vérification renvoyé.",
    display_name: "Nom affiché",
    username: "Nom d'utilisateur",
    username_help: "3-20 caractères, lettres/chiffres/underscore uniquement.",
    username_required: "Le nom d'utilisateur est requis.",
    username_error: "Utilisez 3-20 caractères (A-Z, 0-9, _).",
    avatar: "Photo de profil",
    avatar_desc: "Importez une image carrée. Recadrage bientôt.",
    no_photo: "Aucune photo",
    change: "Changer",
    remove: "Supprimer",
    account_short_desc: "Gérez votre e-mail et l'état du compte.",
    account_short_hint: "Vérifiez votre e-mail et gérez les actions de sécurité rapides.",
    forgot_password: "Mot de passe oublié ?",

    // ───────────────── SECURITY
    security_desc: "Changez votre mot de passe. La 2FA arrive bientôt.",
    current_password: "Mot de passe actuel",
    new_password: "Nouveau mot de passe",
    confirm_password: "Confirmer le nouveau mot de passe",
    password_rules: "Au moins 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial.",
    password_rules_short: "Mot de passe trop faible",
    password_mismatch: "Les mots de passe ne correspondent pas.",

    // Raccourcis (page Compte)
    security_shortcuts_desc: "Raccourcis vers les paramètres de sécurité.",
    change_password: "Changer le mot de passe",
    change_password_desc: "Mettre à jour votre mot de passe actuel.",
    go_to_security: "Aller à la sécurité",
    sessions_short_desc: "Voir les appareils connectés.",
    go_to_sessions: "Voir les sessions",

    // ───────────────── SESSIONS
    sessions_desc: "Déconnectez les autres appareils.",
    this_device: "Cet appareil",
    last_active: "Dernière activité",
    revoke: "Révoquer",
    no_other_sessions: "Aucune autre session.",
    revoke_all_others: "Révoquer toutes les autres sessions",
    sessions_refresh: "Rafraîchir",
    sessions_refreshed: "Sessions à jour.",
    revoke_all_others_btn: "Se déconnecter des autres sessions",
    revoke_all_done: "Autres sessions déconnectées.",
    revoke_all_failed: "Échec de la révocation des sessions.",

    // ───────────────── TWOFA
    twofa_desc: "Protégez votre compte avec une application d'authentification (à venir).",
    not_available_yet: "Pas encore disponible.",
    enable_2fa_soon: "Activer la 2FA (bientôt)",

    // ───────────────── DATA / COMPLIANCE
    data_desc: "Exportez vos données locales ou supprimez votre compte sur cet appareil.",
    export_json: "Exporter mes données (JSON)",
    delete_account: "Supprimer mon compte",
    delete_confirm: "Supprimer vos données locales ? Cette action est irréversible.",
    deleted_local: "Données locales supprimées. (Aucun appel serveur.)",

    // ───────────────── ACCESSIBILITY
    accessibility_desc: "Rendre Epion plus lisible.",
    a11y_larger_text: "Texte plus grand",
    a11y_larger_text_desc: "Augmenter la taille de base pour une meilleure lisibilité.",
    a11y_higher_contrast: "Contraste renforcé",
    a11y_higher_contrast_desc: "Augmenter légèrement le contraste dans l'interface.",

    // ───────────────── BILLING (placeholders)
    billing: "Facturation",
    billing_desc: "Votre formule et renouvellement (à venir).",
    current_plan: "Formule actuelle",
    next_billing: "Prochain renouvellement",
    manage_billing: "Gérer l'abonnement",
    view_invoices: "Voir les factures",

    // ───────────────── COMMON
    save: "Enregistrer",
    cancel: "Annuler",
    saved: "Enregistré",
    required: "Requis",
    saving: "Enregistrement…",

    // nav
    actuality: "Actualité",
    download: "Télécharger",
    changelog: "Journal des versions",
    guide: "Guide",
    blog: "Blog",
    transparency: "Transparence",
    contact: "Contact",
    moderation_policy: "Politique de modération",
    press: "Presse",
    cookies: "Cookies",

    // Download
    download_title: "Télécharger Epion",
    download_lead: "Applications bureau et mobile bientôt disponibles.",
    download_desktop: "Télécharger pour ordinateur",
    download_mobile: "Obtenir l'app mobile",


    // Changelog
    changelog_title: "Journal des versions",
    changelog_lead: "Ce qui a changé, et quand.",
    changelog_stub: "Premières pages publiques ajoutées.",

    // Guide
    guide_title: "Guide d'utilisation",
    guide_lead: "Comment tirer le meilleur d'Epion.",
    guide_block_1: "Cherchez et lisez des articles structurés clairement.",
    guide_block_2: "Demandez à Epion des résumés et des sources dans le chat.",

    // Blog
    blog_title: "Blog Epion",
    blog_lead: "Notes et mises à jour de l'équipe.",
    blog_stub: "Aucun article pour l'instant.",

    // Transparence
    transparency_title: "Notre transparence",
    transparency_lead: "Comment nous sourçons, classons et finançons.",
    transparency_sources: "Sources : médias reconnus et flux vérifiés.",
    transparency_funding: "Financement : autofinancé pour le moment ; détails à venir.",

    // Contact
    contact_title: "Nous contacter",
    contact_lead: "Questions, retours, partenariats.",
    contact_name: "Votre nom",
    contact_email: "Votre e-mail",
    contact_message: "Votre message",
    contact_send: "Envoyer",

    // Modération
    moderation_title: "Politique de modération",
    moderation_lead: "Des règles claires pour des échanges constructifs.",
    moderation_stub: "Texte de politique (provisoire). Version complète à venir.",

    // Presse
    press_title: "Presse",
    press_lead: "Demandes presse et documents.",
    press_stub: "Kit média et contacts presse seront disponibles ici.",
    press_kit: "Télécharger le kit presse",

    // Cookies
    cookies_title: "Cookies",
    cookies_lead: "Comment et pourquoi nous utilisons des cookies.",
    cookies_stub: "Nous utilisons uniquement des cookies essentiels à ce stade.",
  },
} as const;
