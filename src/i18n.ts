import type { UiLang } from "./types";

export const COPY: Record<
  UiLang,
  {
    brand: string;
    navStudio: string;
    navQueue: string;
    navChannel: string;
    newPollBtn: string;
    studioTitle: string;
    studioSubtitle: string;
    queueTitle: string;
    queueSubtitle: string;
    channelTitle: string;
    channelSubtitle: string;
    tabText: string;
    tabImage: string;
    tabPdf: string;
    textPlaceholder: string;
    loadSampleBtn: string;
    uploadImageHint: string;
    uploadPdfHint: string;
    removeFile: string;
    agentInstructionLabel: string;
    agentInstructionPlaceholder: string;
    pollCountLabel: string;
    postCountLabel: string;
    pollCountAll: string;
    outputFormatLabel: string;
    formatPolls: string;
    formatTextPost: string;
    formatImagePost: string;
    formatBoth: string;
    formatIndex: string;
    pollModeLabel: string;
    modeAuto: string;
    modeRegular: string;
    modeQuiz: string;
    outputLangLabel: string;
    langAuto: string;
    langBn: string;
    langEn: string;
    anonymousLabel: string;
    multiAnswerLabel: string;
    generateBtn: string;
    generateTextPostBtn: string;
    generateImagePostBtn: string;
    generateBothBtn: string;
    addDirectTextPostBtn: string;
    addDirectImagePostBtn: string;
    loadSampleReadyPollBtn: string;
    addDirectReadyPollsBtn: string;
    manualPollSectionTitle: string;
    manualPollSectionHint: string;
    manualPollQuestionPlaceholder: string;
    manualPollOptionPlaceholder: string;
    manualPollSelectCorrectHint: string;
    addManualPollToPreviewBtn: string;
    sendManualPollDirectBtn: string;
    postAllNowBtn: string;
    postingAllBtn: string;
    aiCustomTitle: string;
    aiCustomHint: string;
    optionsPerPollLabel: string;
    difficultyLabel: string;
    difficultyAuto: string;
    difficultyEasy: string;
    difficultyMedium: string;
    difficultyHard: string;
    toneLabel: string;
    toneAuto: string;
    toneExam: string;
    toneEngaging: string;
    toneConcise: string;
    explanationModeLabel: string;
    explanationAuto: string;
    explanationInclude: string;
    explanationOmit: string;
    sourceFidelityLabel: string;
    fidelityBalanced: string;
    fidelityStrict: string;
    numberingStyleLabel: string;
    numberingNone: string;
    numberingBn: string;
    numberingEn: string;
    questionPrefixLabel: string;
    questionPrefixPlaceholder: string;
    shuffleOptionsLabel: string;
    batchCustomTitle: string;
    batchShuffleBtn: string;
    batchNumberBnBtn: string;
    batchNumberEnBtn: string;
    batchStripNumbersBtn: string;
    indexingKeywordsLabel: string;
    indexingKeywordsPlaceholder: string;
    indexChannelBtn: string;
    indexTargetLabel: string;
    indexingBtn: string;
    imagePostLabel: string;
    imageCaptionLabel: string;
    noImageWarning: string;
    generatingBtn: string;
    agentSummaryHeading: string;
    refinePlaceholder: string;
    refineBtn: string;
    refiningBtn: string;
    previewHeading: string;
    emptyPreviewTitle: string;
    emptyPreviewBody: string;
    postNowBtn: string;
    postingBtn: string;
    scheduleSectionTitle: string;
    scheduleStartLabel: string;
    intervalLabel: string;
    intervalNone: string;
    scheduleAllBtn: string;
    schedulingBtn: string;
    editPoll: string;
    doneEditing: string;
    addOption: string;
    captionLabel: string;
    captionPlaceholder: string;
    correctAnswerLabel: string;
    explanationLabel: string;
    explanationPlaceholder: string;
    quizLabel: string;
    regularPollLabel: string;
    textPostLabel: string;
    postTitleLabel: string;
    postBodyLabel: string;
    anonymousVotesNote: string;
    filterAll: string;
    filterPending: string;
    filterPaused: string;
    filterPosted: string;
    filterFailed: string;
    searchPlaceholder: string;
    emptyQueueTitle: string;
    emptyQueueBody: string;
    goToStudioBtn: string;
    statusPending: string;
    statusPaused: string;
    statusPosted: string;
    statusFailed: string;
    pauseAction: string;
    resumeAction: string;
    retryAction: string;
    rescheduleAction: string;
    deleteAction: string;
    modeDirectTab: string;
    modeBotTab: string;
    apiIdLabel: string;
    apiHashLabel: string;
    phoneLabel: string;
    phonePlaceholder: string;
    sendCodeBtn: string;
    sendingCodeBtn: string;
    otpLabel: string;
    otpPlaceholder: string;
    twoFaLabel: string;
    twoFaPlaceholder: string;
    verifyLoginBtn: string;
    verifyingLoginBtn: string;
    restartLoginBtn: string;
    disconnectAccountBtn: string;
    refreshChannelsBtn: string;
    selectChannelLabel: string;
    manualChannelPlaceholder: string;
    useThisChannelBtn: string;
    quickQuizBotBtn: string;
    botTargetHint: string;
    directGuideTitle: string;
    directGuideSteps: string[];
    botTokenLabel: string;
    botTokenPlaceholder: string;
    channelIdLabel: string;
    channelIdPlaceholder: string;
    verifySaveBtn: string;
    verifyingBtn: string;
    clearTokenBtn: string;
    verifiedConnection: string;
    notConnected: string;
    personaLabel: string;
    personaPlaceholder: string;
    savePersonaBtn: string;
    guideTitle: string;
    guideSteps: string[];
    channelWarningBanner: string;
    configureChannelLink: string;
    nextScheduledLabel: string;
    noUpcomingLabel: string;
  }
> = {
  bn: {
    brand: "TelePoll Agent",
    navStudio: "এআই স্টুডিও",
    navQueue: "সময়সূচী কিউ",
    navChannel: "টেলিগ্রাম সংযোগ",
    newPollBtn: "নতুন পোল তৈরি",
    studioTitle: "পার্সোনাল এআই স্টুডিও",
    studioSubtitle:
      "টেক্সট, ছবি বা পিডিএফ দিন — এআই এজেন্ট টেলিগ্রাম পোল ও চ্যানেল টেক্সট পোস্ট তৈরি করে সরাসরি আপনার টেলিগ্রাম অ্যাকাউন্ট থেকে চ্যানেলে পোস্ট বা শিডিউল করবে।",
    queueTitle: "পোস্ট ও পোল সময়সূচী কিউ",
    queueSubtitle:
      "নির্ধারিত সময় অনুযায়ী আপনার টেলিগ্রাম চ্যানেলে পোল ও টেক্সট পোস্টগুলো স্বয়ংক্রিয়ভাবে প্রকাশিত হবে।",
    channelTitle: "টেলিগ্রাম অ্যাকাউন্ট ও চ্যানেল সংযোগ",
    channelSubtitle:
      "BotFather ছাড়াই সরাসরি আপনার টেলিগ্রাম অ্যাকাউন্ট লগইন করে চ্যানেল নির্বাচন করুন, অথবা চাইলে বট টোকেন ব্যবহার করুন।",
    tabText: "টেক্সট / আর্টিকেল",
    tabImage: "ইমেজ / নোট",
    tabPdf: "পিডিএফ ফাইল",
    textPlaceholder:
      "এখানে যেকোনো অনুচ্ছেদ, পড়াশোনার নোট, খবর বা বিষয়বস্তু পেস্ট করুন...",
    loadSampleBtn: "নমুনা টেক্সট লোড করুন",
    uploadImageHint: "ইমেজ আপলোড করতে ক্লিক করুন বা ড্র্যাগ করুন (PNG, JPG, WEBP)",
    uploadPdfHint: "পিডিএফ ফাইল আপলোড করতে ক্লিক করুন বা ড্র্যাগ করুন (সর্বোচ্চ ২০ MB)",
    removeFile: "ফাইল সরান",
    agentInstructionLabel: "পার্সোনাল এজেন্ট নির্দেশনা (ঐচ্ছিক)",
    agentInstructionPlaceholder:
      "যেমন: বিসিএস পরীক্ষার উপযোগী সবগুলো কুইজ পোল বানাও, অথবা চ্যানেলের জন্য সুন্দর একটি টেক্সট পোস্ট লিখে দাও...",
    pollCountLabel: "পোল সংখ্যা",
    postCountLabel: "পোস্ট সংখ্যা",
    pollCountAll: "সবগুলো (যত পসিবল)",
    outputFormatLabel: "আউটপুট ধরন",
    formatPolls: "পোল",
    formatTextPost: "টেক্সট পোস্ট",
    formatImagePost: "ছবি পোস্ট",
    formatBoth: "পোল + টেক্সট",
    formatIndex: "ইনডেক্সিং",
    pollModeLabel: "পোলের ধরন",
    modeAuto: "এআই নির্ধারিত",
    modeRegular: "সাধারণ পোল",
    modeQuiz: "কুইজ মোড",
    outputLangLabel: "ভাষা",
    langAuto: "ইনপুট অনুযায়ী",
    langBn: "বাংলা",
    langEn: "English",
    anonymousLabel: "অ্যানোনিমাস ভোট (চ্যানেলের জন্য প্রয়োজনীয়)",
    multiAnswerLabel: "একাধিক উত্তর অনুমোদিত",
    generateBtn: "এআই এজেন্ট দিয়ে পোল তৈরি করুন",
    generateTextPostBtn: "এআই এজেন্ট দিয়ে টেক্সট পোস্ট তৈরি করুন",
    generateImagePostBtn: "ছবির জন্য এআই ক্যাপশন ও ট্যাগ তৈরি করুন",
    generateBothBtn: "এআই দিয়ে পোস্ট ও পোল তৈরি করুন",
    addDirectTextPostBtn: "লেখা হুবহু পোস্ট প্রিভিউতে নিন",
    addDirectImagePostBtn: "ছবি সরাসরি প্রিভিউতে নিন",
    loadSampleReadyPollBtn: "নমুনা রেডি পোল",
    addDirectReadyPollsBtn: "রেডি পোল সরাসরি প্রিভিউতে নিন (এআই ছাড়াই)",
    manualPollSectionTitle: "ম্যানুয়াল পোল মেকার (নিজে তৈরি করে সরাসরি পাঠান)",
    manualPollSectionHint: "কোনো এআই পরিবর্তন ছাড়াই হুবহু বানান ও যাচাইকৃত সঠিক উত্তরসহ পোল তৈরি করুন।",
    manualPollQuestionPlaceholder: "এখানে পোলের প্রশ্ন হুবহু লিখুন (সর্বোচ্চ ৩০০ অক্ষর)...",
    manualPollOptionPlaceholder: "অপশন লিখুন",
    manualPollSelectCorrectHint: "কুইজের সঠিক উত্তরটি ক্লিক করে নির্বাচন করুন:",
    addManualPollToPreviewBtn: "প্রিভিউতে যুক্ত করুন",
    sendManualPollDirectBtn: "সরাসরি চ্যানেলে পাঠান",
    postAllNowBtn: "সবগুলো এখনই চ্যানেলে পাঠান",
    postingAllBtn: "সবগুলো পাঠানো হচ্ছে...",
    aiCustomTitle: "এআই পোল কাস্টমাইজেশন অপশন",
    aiCustomHint: "এআই কীভাবে প্রশ্ন, অপশন ও ব্যাখ্যা সাজাবে তা সেট করুন",
    optionsPerPollLabel: "প্রতি পোলে অপশন",
    difficultyLabel: "প্রশ্নের মান",
    difficultyAuto: "স্বাভাবিক (এআই)",
    difficultyEasy: "সহজ / বেসিক",
    difficultyMedium: "মাঝারি / প্র্যাকটিস",
    difficultyHard: "কঠিন (BCS / ভর্তি মান)",
    toneLabel: "টোন ও স্টাইল",
    toneAuto: "নিরপেক্ষ ও নির্ভুল",
    toneExam: "পরীক্ষামুখী (অ্যাকাডেমিক)",
    toneEngaging: "আকর্ষণীয় (চ্যানেল উপযোগী)",
    toneConcise: "সংক্ষিপ্ত ও স্পষ্ট",
    explanationModeLabel: "কুইজ ব্যাখ্যা",
    explanationAuto: "প্রয়োজন অনুযায়ী",
    explanationInclude: "অবশ্যই ব্যাখ্যাসহ",
    explanationOmit: "ব্যাখ্যা ছাড়া",
    sourceFidelityLabel: "সোর্স অনুসরণ",
    fidelityBalanced: "এআই দিয়ে নতুন প্রশ্ন",
    fidelityStrict: "সোর্স লেখা যতটা সম্ভব হুবহু",
    numberingStyleLabel: "প্রশ্ন সিরিয়াল",
    numberingNone: "নম্বর ছাড়া",
    numberingBn: "বাংলা (১. ২. ৩.)",
    numberingEn: "ইংরেজি (1. 2. 3.)",
    questionPrefixLabel: "প্রশ্নের শুরুতে ট্যাগ / প্রিফিক্স (ঐচ্ছিক)",
    questionPrefixPlaceholder: "যেমন: [BCS] অথবা [বাংলা]",
    shuffleOptionsLabel: "অপশনগুলো এলোমেলো (Shuffle) রাখুন",
    batchCustomTitle: "সবগুলো একসাথে কাস্টমাইজ করুন",
    batchShuffleBtn: "অপশন শাফেল",
    batchNumberBnBtn: "১.২. নম্বর",
    batchNumberEnBtn: "1.2. নম্বর",
    batchStripNumbersBtn: "নম্বর সরান",
    indexingKeywordsLabel: "ইনডেক্সিং কিওয়ার্ড (কমা দিয়ে আলাদা করুন)",
    indexingKeywordsPlaceholder: "যেমন: BCS, Notice, Physics, Admission",
    indexChannelBtn: "কিওয়ার্ড দিয়ে চ্যানেল ইনডেক্স তৈরি করুন",
    indexTargetLabel: "কোন চ্যানেল ইনডেক্স করবেন (@username / t.me লিংক)",
    indexingBtn: "চ্যানেল স্ক্যান ও ইনডেক্স হচ্ছে...",
    imagePostLabel: "ছবি পোস্ট",
    imageCaptionLabel: "ছবির ক্যাপশন",
    noImageWarning: "ছবি পোস্ট তৈরি করতে আগে ইমেজ ট্যাব থেকে একটি ছবি আপলোড করুন।",
    generatingBtn: "এজেন্ট বিশ্লেষণ করছে...",
    agentSummaryHeading: "এআই এজেন্টের সারসংক্ষেপ",
    refinePlaceholder:
      "এজেন্টকে বলুন: যেমন 'পোস্টটি আরও সংক্ষিপ্ত করো' বা 'অপশনগুলো ছোট করো'...",
    refineBtn: "পরিবর্তন করুন",
    refiningBtn: "আপডেট হচ্ছে...",
    previewHeading: "টেলিগ্রাম প্রিভিউ",
    emptyPreviewTitle: "এখনও কোনো পোল বা পোস্ট তৈরি হয়নি",
    emptyPreviewBody:
      "বাম পাশে টেক্সট, ছবি বা পিডিএফ দিয়ে জেনারেট বাটনে ক্লিক করলে এখানে টেলিগ্রাম পোল, ছবি ও টেক্সট পোস্ট প্রিভিউ দেখাবে।",
    postNowBtn: "এখনই চ্যানেলে পোস্ট করুন",
    postingBtn: "পোস্ট হচ্ছে...",
    scheduleSectionTitle: "স্বয়ংক্রিয় পোস্টের সময়সূচী নির্ধারণ",
    scheduleStartLabel: "শুরুর তারিখ ও সময়",
    intervalLabel: "প্রতিটি পোস্টের মাঝে বিরতি",
    intervalNone: "একসাথে সবগুলো",
    scheduleAllBtn: "সময়সূচীতে যুক্ত করুন",
    schedulingBtn: "যুক্ত হচ্ছে...",
    editPoll: "সম্পাদনা",
    doneEditing: "সম্পন্ন",
    addOption: "+ অপশন যোগ করুন",
    captionLabel: "চ্যানেল ক্যাপশন (ঐচ্ছিক)",
    captionPlaceholder: "পোলের আগে চ্যানলে দেখানোর জন্য ছোট বার্তা...",
    correctAnswerLabel: "সঠিক উত্তর",
    explanationLabel: "কুইজ ব্যাখ্যা",
    explanationPlaceholder: "ভোট দেওয়ার পর ব্যবহারকারী এই ব্যাখ্যা দেখতে পাবে...",
    quizLabel: "কুইজ",
    regularPollLabel: "পোল",
    textPostLabel: "টেক্সট পোস্ট",
    postTitleLabel: "পোস্ট শিরোনাম (কিউ লেবেল)",
    postBodyLabel: "চ্যানেল পোস্টের লেখা",
    anonymousVotesNote: "অ্যানোনিমাস ভোট",
    filterAll: "সবগুলো",
    filterPending: "নির্ধারিত",
    filterPaused: "বিরতিতে",
    filterPosted: "পোস্ট হয়েছে",
    filterFailed: "ব্যর্থ",
    searchPlaceholder: "পোলের প্রশ্ন বা চ্যানেল খুঁজুন...",
    emptyQueueTitle: "সময়সূচীতে কোনো পোল নেই",
    emptyQueueBody:
      "স্টুডিও থেকে পোল তৈরি করে নির্দিষ্ট তারিখ ও সময় সেট করলে তা এখানে তালিকাভুক্ত হবে।",
    goToStudioBtn: "স্টুডিওতে যান",
    statusPending: "নির্ধারিত",
    statusPaused: "বিরতিতে",
    statusPosted: "পোস্ট হয়েছে",
    statusFailed: "ব্যর্থ",
    pauseAction: "বিরতি দিন",
    resumeAction: "চালু করুন",
    retryAction: "পুনরায় চেষ্টা",
    rescheduleAction: "সময় বদলান",
    deleteAction: "মুছুন",
    modeDirectTab: "সরাসরি টেলিগ্রাম অ্যাকাউন্ট",
    modeBotTab: "বট টোকেন (ঐচ্ছিক)",
    apiIdLabel: "টেলিগ্রাম API ID",
    apiHashLabel: "টেলিগ্রাম API Hash",
    phoneLabel: "টেলিগ্রাম ফোন নম্বর (কান্ট্রি কোডসহ)",
    phonePlaceholder: "+8801XXXXXXXXX",
    sendCodeBtn: "ভেরিফিকেশন কোড পাঠান",
    sendingCodeBtn: "কোড পাঠানো হচ্ছে...",
    otpLabel: "টেলিগ্রাম লগইন কোড",
    otpPlaceholder: "আপনার টেলিগ্রাম অ্যাপে আসা কোড লিখুন (যেমন 12345)",
    twoFaLabel: "টু-স্টেপ ভেরিফিকেশন পাসওয়ার্ড (2FA)",
    twoFaPlaceholder: "আপনার টেলিগ্রাম ক্লাউড পাসওয়ার্ড লিখুন",
    verifyLoginBtn: "যাচাই ও লগইন করুন",
    verifyingLoginBtn: "লগইন হচ্ছে...",
    restartLoginBtn: "নম্বর পরিবর্তন করুন",
    disconnectAccountBtn: "অ্যাকাউন্ট ডিসকানেক্ট",
    refreshChannelsBtn: "চ্যানেল রিফ্রেশ",
    selectChannelLabel: "আপনার টেলিগ্রাম চ্যানেল, গ্রুপ বা বট নির্বাচন করুন",
    manualChannelPlaceholder: "অথবা @QuizBot, @channel_username কিংবা https://t.me/... লিখুন",
    useThisChannelBtn: "টার্গেট সেট করুন",
    quickQuizBotBtn: "@QuizBot টার্গেট হিসেবে নিন",
    botTargetHint: "টিপস: আপনার অ্যাকাউন্ট থেকে @QuizBot বা যেকোনো বট ও চ্যানেলে সরাসরি পোল ও মেসেজ পাঠানো যাবে।",
    directGuideTitle: "সরাসরি টেলিগ্রাম অ্যাকাউন্ট সংযুক্ত করার ৩টি সহজ ধাপ",
    directGuideSteps: [
      "my.telegram.org/apps ওয়েবসাইটে আপনার ফোন নম্বর দিয়ে লগইন করুন এবং 'API development tools' থেকে একবারের জন্য App api_id এবং api_hash কপি করুন।",
      "উপরের ফর্মে API ID, API Hash এবং আপনার টেলিগ্রাম ফোন নম্বর (+880...) দিয়ে 'ভেরিফিকেশন কোড পাঠান' ক্লিক করুন।",
      "টেলিগ্রাম অ্যাপে আসা কোড দিয়ে লগইন করলে আপনার সব চ্যানেল ও গ্রুপের তালিকা স্বয়ংক্রিয়ভাবে চলে আসবে—কোনো বট তৈরি করতে হবে না।",
    ],
    botTokenLabel: "টেলিগ্রাম বট টোকেন",
    botTokenPlaceholder: "123456789:AAH... (BotFather থেকে প্রাপ্ত টোকেন)",
    channelIdLabel: "চ্যানেল ইউজারনেম বা আইডি",
    channelIdPlaceholder: "@my_channel অথবা -1001234567890",
    verifySaveBtn: "যাচাই ও সংরক্ষণ করুন",
    verifyingBtn: "যাচাই হচ্ছে...",
    clearTokenBtn: "টোকেন মুছুন",
    verifiedConnection: "সংযোগ সক্রিয়",
    notConnected: "চ্যানেল সংযুক্ত নয়",
    personaLabel: "পার্সোনাল এআই এজেন্ট পার্সোনা ও নির্দেশনা",
    personaPlaceholder: "এজেন্ট কী ধরনের টোন ও ফরম্যাটে পোল তৈরি করবে তা লিখুন...",
    savePersonaBtn: "এজেন্ট সেটিংস সংরক্ষণ করুন",
    guideTitle: "বট টোকেন ব্যবহারের নিয়ম (ঐচ্ছিক)",
    guideSteps: [
      "টেলিগ্রামে @BotFather-এ গিয়ে /newbot দিয়ে বট তৈরি করে Bot Token কপি করুন।",
      "চ্যানেলের Administrators তালিকায় বটটিকে Post Messages অনুমতির সাথে যোগ করুন।",
      "চ্যানেল @username বা -100 দিয়ে শুরু ID দিয়ে যাচাই করুন।",
    ],
    channelWarningBanner:
      "স্বয়ংক্রিয় পোস্ট চালু করতে আপনার টেলিগ্রাম অ্যাকাউন্ট লগইন করে চ্যানেল নির্বাচন করুন।",
    configureChannelLink: "টেলিগ্রাম কানেক্ট করুন",
    nextScheduledLabel: "পরবর্তী শিডিউল",
    noUpcomingLabel: "কোনো আসন্ন পোস্ট নেই",
  },
  en: {
    brand: "TelePoll Agent",
    navStudio: "Agent Studio",
    navQueue: "Schedule Queue",
    navChannel: "Telegram Access",
    newPollBtn: "New Poll",
    studioTitle: "Personal AI Studio",
    studioSubtitle:
      "Provide text, images, or PDFs — your personal AI agent crafts Telegram polls and channel text posts and dispatches or schedules them directly from your Telegram account.",
    queueTitle: "Schedule & Publishing Queue",
    queueSubtitle:
      "Polls and text posts in the queue are automatically dispatched to your Telegram channel at their scheduled time.",
    channelTitle: "Telegram Account & Channel Access",
    channelSubtitle:
      "Sign in directly with your Telegram account to pick and post to any of your channels without BotFather, or optionally use a Bot Token.",
    tabText: "Text / Article",
    tabImage: "Image / Notes",
    tabPdf: "PDF Document",
    textPlaceholder:
      "Paste any article, study notes, announcement, or topic brief here...",
    loadSampleBtn: "Load Sample Text",
    uploadImageHint: "Click or drag an image to upload (PNG, JPG, WEBP)",
    uploadPdfHint: "Click or drag a PDF document to upload (up to 20 MB)",
    removeFile: "Remove file",
    agentInstructionLabel: "Personal Agent Instruction (Optional)",
    agentInstructionPlaceholder:
      "e.g. Create all possible quiz polls, or craft an engaging Telegram channel text post...",
    pollCountLabel: "Poll Count",
    postCountLabel: "Post Count",
    pollCountAll: "All Possible",
    outputFormatLabel: "Output Format",
    formatPolls: "Polls",
    formatTextPost: "Text Post",
    formatImagePost: "Photo Post",
    formatBoth: "Polls + Post",
    formatIndex: "Indexing",
    pollModeLabel: "Poll Type",
    modeAuto: "Agent Decides",
    modeRegular: "Regular Poll",
    modeQuiz: "Quiz Mode",
    outputLangLabel: "Language",
    langAuto: "Match Input",
    langBn: "বাংলা",
    langEn: "English",
    anonymousLabel: "Anonymous Voting (Required for channels)",
    multiAnswerLabel: "Allow Multiple Answers",
    generateBtn: "Generate Polls with Agent",
    generateTextPostBtn: "Generate Text Post with Agent",
    generateImagePostBtn: "Generate Photo Caption & Tags",
    generateBothBtn: "Generate Post & Polls with Agent",
    addDirectTextPostBtn: "Use Text Directly as Post",
    addDirectImagePostBtn: "Use Photo Directly in Preview",
    loadSampleReadyPollBtn: "Sample Ready Poll",
    addDirectReadyPollsBtn: "Load Ready Polls Directly (No AI)",
    manualPollSectionTitle: "Manual Poll Composer (Exact & Verified)",
    manualPollSectionHint: "Type your exact spelling and pick the verified answer directly with zero AI changes.",
    manualPollQuestionPlaceholder: "Enter exact poll question (max 300 chars)...",
    manualPollOptionPlaceholder: "Option",
    manualPollSelectCorrectHint: "Click the checkmark to set the verified correct answer:",
    addManualPollToPreviewBtn: "Add to Preview",
    sendManualPollDirectBtn: "Send Directly to Channel",
    postAllNowBtn: "Post All Now",
    postingAllBtn: "Posting all...",
    aiCustomTitle: "AI Poll Customization",
    aiCustomHint: "Control options count, difficulty, tone, explanations, and numbering",
    optionsPerPollLabel: "Options / Poll",
    difficultyLabel: "Difficulty",
    difficultyAuto: "Balanced (AI)",
    difficultyEasy: "Easy / Basic",
    difficultyMedium: "Medium / Practice",
    difficultyHard: "Hard (Competitive Exam)",
    toneLabel: "Tone & Style",
    toneAuto: "Neutral & Accurate",
    toneExam: "Formal Exam Style",
    toneEngaging: "Engaging & Conversational",
    toneConcise: "Ultra-Concise",
    explanationModeLabel: "Quiz Explanation",
    explanationAuto: "Auto",
    explanationInclude: "Always Include",
    explanationOmit: "No Explanation",
    sourceFidelityLabel: "Source Fidelity",
    fidelityBalanced: "Craft Fresh Questions",
    fidelityStrict: "Keep Source Wording Strictly",
    numberingStyleLabel: "Question Numbering",
    numberingNone: "No Numbering",
    numberingBn: "Bengali (১. ২. ৩.)",
    numberingEn: "English (1. 2. 3.)",
    questionPrefixLabel: "Question Prefix / Tag (Optional)",
    questionPrefixPlaceholder: "e.g. [BCS] or [Daily Quiz]",
    shuffleOptionsLabel: "Shuffle poll options safely",
    batchCustomTitle: "Quick Customize All Polls",
    batchShuffleBtn: "Shuffle Options",
    batchNumberBnBtn: "Add ১.২.",
    batchNumberEnBtn: "Add 1.2.",
    batchStripNumbersBtn: "Clear Numbers",
    indexingKeywordsLabel: "Indexing Keywords (comma-separated)",
    indexingKeywordsPlaceholder: "e.g. BCS, Notice, Physics, Admission",
    indexChannelBtn: "Build Keyword Channel Index",
    indexTargetLabel: "Channel to Index (@username or t.me link)",
    indexingBtn: "Scanning & indexing channel...",
    imagePostLabel: "Photo Post",
    imageCaptionLabel: "Photo Caption",
    noImageWarning: "Please upload an image in the Image tab first.",
    generatingBtn: "Agent analyzing...",
    agentSummaryHeading: "Agent Analysis",
    refinePlaceholder:
      "Ask the agent to refine: e.g. 'Make the caption shorter' or 'Translate to Bengali'...",
    refineBtn: "Apply",
    refiningBtn: "Updating...",
    previewHeading: "Telegram Preview",
    emptyPreviewTitle: "No drafts yet",
    emptyPreviewBody:
      "Add text, an image, or a PDF on the left and run the agent to preview polls, photo posts, or channel text posts here.",
    postNowBtn: "Post to Channel Now",
    postingBtn: "Posting...",
    scheduleSectionTitle: "Schedule Automated Posting",
    scheduleStartLabel: "Start Date & Time",
    intervalLabel: "Spacing Between Items",
    intervalNone: "Post all at start time",
    scheduleAllBtn: "Add to Schedule Queue",
    schedulingBtn: "Scheduling...",
    editPoll: "Edit",
    doneEditing: "Done",
    addOption: "+ Add Option",
    captionLabel: "Channel Intro Message (Optional)",
    captionPlaceholder: "Short message posted right before the poll...",
    correctAnswerLabel: "Correct Answer",
    explanationLabel: "Quiz Explanation",
    explanationPlaceholder: "Shown to voters after selecting an answer...",
    quizLabel: "Quiz",
    regularPollLabel: "Poll",
    textPostLabel: "Text Post",
    postTitleLabel: "Post Title (Queue Label)",
    postBodyLabel: "Channel Post Text",
    anonymousVotesNote: "Anonymous Poll",
    filterAll: "All",
    filterPending: "Scheduled",
    filterPaused: "Paused",
    filterPosted: "Posted",
    filterFailed: "Failed",
    searchPlaceholder: "Search question or channel...",
    emptyQueueTitle: "Your schedule queue is empty",
    emptyQueueBody:
      "Generate polls in Agent Studio and choose a date & time to schedule automatic channel posts.",
    goToStudioBtn: "Open Agent Studio",
    statusPending: "Scheduled",
    statusPaused: "Paused",
    statusPosted: "Posted",
    statusFailed: "Failed",
    pauseAction: "Pause",
    resumeAction: "Resume",
    retryAction: "Retry",
    rescheduleAction: "Reschedule",
    deleteAction: "Delete",
    modeDirectTab: "Direct Telegram Account",
    modeBotTab: "Bot Token (Optional)",
    apiIdLabel: "Telegram API ID",
    apiHashLabel: "Telegram API Hash",
    phoneLabel: "Telegram Phone Number (with country code)",
    phonePlaceholder: "+8801XXXXXXXXX",
    sendCodeBtn: "Send Login Code",
    sendingCodeBtn: "Sending code...",
    otpLabel: "Telegram Verification Code",
    otpPlaceholder: "Enter code sent to your Telegram app (e.g. 12345)",
    twoFaLabel: "Two-Step Verification Password (2FA)",
    twoFaPlaceholder: "Enter your Telegram cloud password",
    verifyLoginBtn: "Verify & Sign In",
    verifyingLoginBtn: "Signing in...",
    restartLoginBtn: "Change Number",
    disconnectAccountBtn: "Disconnect Account",
    refreshChannelsBtn: "Refresh Channels",
    selectChannelLabel: "Select Target Channel, Group, or Bot",
    manualChannelPlaceholder: "Or enter @QuizBot, @channel_username, or https://t.me/...",
    useThisChannelBtn: "Set Target",
    quickQuizBotBtn: "Target @QuizBot",
    botTargetHint: "Tip: In Direct Account mode, you can target bots like @QuizBot directly as well as your channels and groups.",
    directGuideTitle: "Connect Your Telegram Account Directly (No BotFather Needed)",
    directGuideSteps: [
      "Log into my.telegram.org/apps with your phone number and copy your one-time App api_id and api_hash under API development tools.",
      "Enter your API ID, API Hash, and Telegram phone number above, then click Send Login Code.",
      "Enter the login code sent to your Telegram app. Your channels and groups load automatically so you can post polls directly.",
    ],
    botTokenLabel: "Telegram Bot Token",
    botTokenPlaceholder: "123456789:AAH... (obtained from @BotFather)",
    channelIdLabel: "Channel Username or ID",
    channelIdPlaceholder: "@my_channel or -1001234567890",
    verifySaveBtn: "Verify & Save Connection",
    verifyingBtn: "Verifying...",
    clearTokenBtn: "Clear Token",
    verifiedConnection: "Active Connection",
    notConnected: "Channel Not Connected",
    personaLabel: "Personal AI Agent Persona & Rules",
    personaPlaceholder: "Describe how your personal agent should craft polls...",
    savePersonaBtn: "Save Agent Preferences",
    guideTitle: "Bot Token Setup (Optional)",
    guideSteps: [
      "Create a bot with @BotFather (/newbot) and copy the Bot Token.",
      "Add the bot as an Administrator in your channel with Post Messages permission.",
      "Enter @username or -100... Channel ID and click Verify & Save Connection.",
    ],
    channelWarningBanner:
      "Sign in with your Telegram account and select a channel to enable automatic posting.",
    configureChannelLink: "Connect Telegram",
    nextScheduledLabel: "Next Scheduled",
    noUpcomingLabel: "No upcoming posts",
  },
};
