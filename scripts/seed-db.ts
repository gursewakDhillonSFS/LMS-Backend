/**
 * LMS Comprehensive Database Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Drops the entire DB and seeds 50+ courses (10 per category) with full
 * relational data: users, orgs, teachers, batches, enrollments, lessons,
 * sublessons, assignments, quizzes, announcements, schedules, chat groups,
 * messages, orders, progress, reviews, favorites, and certificates.
 *
 * Usage:  npx tsx scripts/seed-db.ts
 */

import mongoose, { Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env ─────────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI missing'); process.exit(1); }

// ─── Deterministic ID generator ────────────────────────────────────────────────
let _counter = 0x1000;
const nextId = () => new Types.ObjectId((++_counter).toString(16).padStart(24, '0'));

// ─── Pre-allocated IDs ────────────────────────────────────────────────────────
// Orgs
const org1Id = nextId(); // TechEd Academy
const org2Id = nextId(); // Creative Labs Institute

// Users
const adminId = nextId();
const instructor1Id = nextId(); // Gursewak (Org1)
const instructor2Id = nextId(); // Meera (Org2)
const teacher1Id = nextId();    // Priya (Org1)
const teacher2Id = nextId();    // Rohan (Org2)
const teacher3Id = nextId();    // Kavya (Org1)
const student1Id = nextId();    // Rahul
const student2Id = nextId();    // Ananya
const student3Id = nextId();    // Vikram
const student4Id = nextId();    // Sneha
const student5Id = nextId();    // Aditya

// Teacher profiles (teachers collection)
const tp_instr1 = nextId(); // Gursewak's teacher profile
const tp_instr2 = nextId(); // Meera's teacher profile
const tp_teach1 = nextId(); // Priya
const tp_teach2 = nextId(); // Rohan
const tp_teach3 = nextId(); // Kavya

// Categories
const catWebDevId = nextId();
const catDesignId = nextId();
const catMarketingId = nextId();
const catDataSciId = nextId();
const catMobileId = nextId();

const students = [
  { _id: student1Id, name: 'Rahul Kumar' },
  { _id: student2Id, name: 'Ananya Patel' },
  { _id: student3Id, name: 'Vikram Joshi' },
  { _id: student4Id, name: 'Sneha Gupta' },
  { _id: student5Id, name: 'Aditya Rao' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COURSE DEFINITIONS — 10 per category
// ═══════════════════════════════════════════════════════════════════════════════

interface CourseDef {
  name: string; dur: string; type: 'free'|'paid'; price: number;
  status: 'published'|'draft'; sched: 'morning'|'evening'|null; live: boolean; demo: boolean;
  skills: string[]; learning: string[];
}

const webDevImages = [
  'photo-1517694712202-14dd9538aa97','photo-1498050108023-c5249f4df085','photo-1555066931-4365d14bab8c',
  'photo-1461749280684-dccba630e2f6','photo-1516116216624-53e697fedbea','photo-1537432376149-e89d45d87f5d',
  'photo-1627398242454-45a1465c2479','photo-1558494949-ef010cbdcc31','photo-1563986768609-322da13575f2','photo-1518770660439-4636190af475',
];
const designImages = [
  'photo-1561070791-2526d30994b5','photo-1558655146-d09347e92766','photo-1581291518633-83b4eef1d2fa',
  'photo-1512941937669-90a1b58e7e9c','photo-1550745165-9bc0b252726f','photo-1573164713714-d95e436ab8d6',
  'photo-1553877522-43269d4ea984','photo-1618004912476-29818d81ae2e','photo-1555421689-491a97ff2040','photo-1633356122102-3fe601e05bd2',
];
const marketingImages = [
  'photo-1460925895917-afdab827c52f','photo-1432888498266-38ffec3eaf0a','photo-1557804506-669a67965ba0',
  'photo-1542435503-956c469947f6','photo-1611162617474-5b21e879e113','photo-1563986768494-4dee2763ff3f',
  'photo-1551288049-bebda4e38f71','photo-1611162616475-46b635cb6868','photo-1559136555-9303baea8ebd','photo-1556742049-0cfed4f6a45d',
];
const dataSciImages = [
  'photo-1551288049-bebda4e38f71','photo-1509228468518-180dd4864904','photo-1504868584819-f8e8b4b6d7e3',
  'photo-1635070041078-e363dbe005cb','photo-1518186285589-2f7649de83e0','photo-1485796826113-174aa68fd81b',
  'photo-1611974789855-9c2a0a7236a3','photo-1677442136019-21780ecad995','photo-1523961131990-5ea7c61b2107','photo-1518432031352-d6fc5c10da5a',
];
const mobileImages = [
  'photo-1512941937669-90a1b58e7e9c','photo-1607252650355-f7fd0460ccdb','photo-1551650975-87deedd944c3',
  'photo-1526498460520-4c246339dccb','photo-1555774698-0b77e0d5fac6','photo-1617040619263-41c5a9ca7521',
  'photo-1563013544-824ae1b704d3','photo-1596742578443-7682ef5251cd','photo-1611532736597-de2d4265fba3','photo-1621839673705-6617adf9e890',
];

const imgUrl = (id: string) => `https://images.unsplash.com/${id}?q=80&w=640&auto=format&fit=crop`;

const WEB_DEV_COURSES: CourseDef[] = [
  { name:'Mastering Full-Stack Web Development', dur:'3_months', type:'paid', price:149, status:'published', sched:'evening', live:true, demo:true, skills:['TypeScript','NestJS','React','MongoDB','Docker'], learning:['Build robust REST & GraphQL APIs','Master React 19 & Next.js App Router','Deploy scalable cloud apps'] },
  { name:'React 19 & Next.js Masterclass', dur:'2_months', type:'paid', price:129, status:'published', sched:'morning', live:true, demo:true, skills:['React 19','Next.js','Server Components','Suspense','Zustand'], learning:['Build SSR/SSG apps with App Router','Master React Server Components','Implement complex state management'] },
  { name:'Node.js & Express Backend Engineering', dur:'1_month', type:'paid', price:89, status:'published', sched:'evening', live:false, demo:false, skills:['Node.js','Express','REST APIs','JWT','Middleware'], learning:['Design RESTful APIs from scratch','Implement auth with Passport.js','Handle file uploads & streaming'] },
  { name:'Advanced TypeScript Patterns', dur:'1_month', type:'paid', price:79, status:'published', sched:null, live:false, demo:false, skills:['TypeScript','Generics','Decorators','Type Guards','Utility Types'], learning:['Master advanced generic patterns','Build type-safe APIs','Implement decorators & metadata'] },
  { name:'MongoDB & Database Design', dur:'1_month', type:'paid', price:69, status:'published', sched:'evening', live:false, demo:false, skills:['MongoDB','Mongoose','Aggregation','Indexing','Sharding'], learning:['Design scalable schemas','Master aggregation pipelines','Optimize queries with indexes'] },
  { name:'GraphQL API Development', dur:'1_month', type:'paid', price:99, status:'published', sched:'morning', live:true, demo:false, skills:['GraphQL','Apollo Server','Resolvers','Subscriptions','Federation'], learning:['Build type-safe GraphQL APIs','Implement real-time subscriptions','Design federated schemas'] },
  { name:'DevOps & CI/CD Pipelines', dur:'2_months', type:'paid', price:119, status:'published', sched:null, live:false, demo:true, skills:['Docker','Kubernetes','GitHub Actions','AWS','Terraform'], learning:['Containerize apps with Docker','Orchestrate with Kubernetes','Automate deployments'] },
  { name:'Web Security & Authentication', dur:'2_weeks', type:'free', price:0, status:'published', sched:'evening', live:false, demo:false, skills:['OAuth 2.0','JWT','CORS','XSS Prevention','CSRF'], learning:['Implement OAuth 2.0 flows','Prevent common vulnerabilities','Secure API endpoints'] },
  { name:'Progressive Web Apps (PWA)', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Service Workers','Cache API','Web Push','Manifest','Workbox'], learning:['Build offline-first apps','Implement push notifications','Optimize caching strategies'] },
  { name:'Microservices Architecture', dur:'3_months', type:'paid', price:179, status:'draft', sched:'morning', live:true, demo:true, skills:['Microservices','RabbitMQ','gRPC','Event Sourcing','CQRS'], learning:['Design microservice boundaries','Implement event-driven communication','Handle distributed transactions'] },
];

const DESIGN_COURSES: CourseDef[] = [
  { name:'Advanced UI/UX Design Masterclass', dur:'1_month', type:'paid', price:99, status:'published', sched:'morning', live:false, demo:false, skills:['Figma','Prototyping','Design Systems','User Research'], learning:['Master dynamic prototyping in Figma','Implement responsive design systems','Conduct user research & testing'] },
  { name:'Figma Pro: Wireframes to Prototypes', dur:'2_weeks', type:'paid', price:49, status:'published', sched:'evening', live:false, demo:true, skills:['Figma','Auto Layout','Components','Variants','Plugins'], learning:['Master auto-layout constraints','Build reusable component libraries','Create interactive prototypes'] },
  { name:'Design Systems & Component Libraries', dur:'1_month', type:'paid', price:89, status:'published', sched:null, live:false, demo:false, skills:['Design Tokens','Storybook','Atomic Design','Theming','Documentation'], learning:['Build scalable design systems','Implement design tokens','Document components effectively'] },
  { name:'Mobile App UI Design', dur:'1_month', type:'paid', price:79, status:'published', sched:'morning', live:true, demo:false, skills:['Mobile UI','iOS HIG','Material Design','Gesture Design','Responsive'], learning:['Design for iOS & Android platforms','Implement gesture-based interactions','Create adaptive layouts'] },
  { name:'Web Accessibility (WCAG 2.1)', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['WCAG','ARIA','Screen Readers','Color Contrast','Keyboard Nav'], learning:['Implement WCAG 2.1 AA standards','Design for screen readers','Test with assistive technologies'] },
  { name:'Motion Design & Micro-interactions', dur:'1_month', type:'paid', price:109, status:'published', sched:'evening', live:true, demo:true, skills:['Framer Motion','CSS Animations','Lottie','After Effects','Principle'], learning:['Create meaningful micro-interactions','Build fluid page transitions','Design loading animations'] },
  { name:'User Research & Testing Methods', dur:'2_weeks', type:'paid', price:59, status:'published', sched:'morning', live:false, demo:false, skills:['User Interviews','Usability Testing','A/B Testing','Surveys','Heuristics'], learning:['Conduct effective user interviews','Run moderated usability tests','Analyze research data'] },
  { name:'Typography & Visual Hierarchy', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Typography','Grid Systems','Visual Weight','Readability','Font Pairing'], learning:['Master typographic scales','Implement effective grid systems','Create clear visual hierarchies'] },
  { name:'Dark Mode & Theming Strategies', dur:'1_week', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Dark Mode','Color Palettes','CSS Variables','Theming','HSL'], learning:['Design dark mode color palettes','Implement dynamic theming','Handle color contrast in both modes'] },
  { name:'Designing for AR/VR Interfaces', dur:'2_months', type:'paid', price:149, status:'draft', sched:'evening', live:true, demo:true, skills:['Spatial Design','3D UI','XR Patterns','Unity','Blender'], learning:['Design spatial user interfaces','Prototype VR interactions','Build AR overlay experiences'] },
];

const MARKETING_COURSES: CourseDef[] = [
  { name:'Digital Marketing & SEO Essentials', dur:'2_weeks', type:'free', price:0, status:'published', sched:'evening', live:false, demo:false, skills:['Google Analytics','SEO','Content Marketing','Copywriting'], learning:['Rank #1 on Google with advanced SEO','Create high-converting campaigns','Master marketing analytics'] },
  { name:'Content Marketing & Copywriting Pro', dur:'1_month', type:'paid', price:79, status:'published', sched:'morning', live:false, demo:false, skills:['Copywriting','Blog Strategy','Content Calendar','SEO Writing','Storytelling'], learning:['Write compelling sales copy','Build content marketing funnels','Optimize content for search engines'] },
  { name:'Social Media Marketing Mastery', dur:'1_month', type:'paid', price:89, status:'published', sched:'evening', live:true, demo:true, skills:['Instagram','TikTok','LinkedIn','Facebook Ads','Community'], learning:['Build engaged social communities','Create viral content strategies','Master paid social advertising'] },
  { name:'Google Ads & PPC Campaigns', dur:'2_weeks', type:'paid', price:69, status:'published', sched:null, live:false, demo:false, skills:['Google Ads','PPC','Search Ads','Display Ads','Remarketing'], learning:['Set up profitable ad campaigns','Optimize bidding strategies','Track conversions accurately'] },
  { name:'Email Marketing Automation', dur:'2_weeks', type:'paid', price:59, status:'published', sched:'morning', live:false, demo:false, skills:['Mailchimp','Drip Campaigns','Segmentation','A/B Testing','Deliverability'], learning:['Build automated email sequences','Segment audiences effectively','Improve open & click rates'] },
  { name:'Influencer Marketing Strategy', dur:'2_weeks', type:'paid', price:49, status:'published', sched:null, live:false, demo:false, skills:['Influencer Outreach','Brand Deals','ROI Tracking','Micro-Influencers','Contracts'], learning:['Identify right influencer partners','Negotiate brand partnerships','Measure campaign ROI'] },
  { name:'Analytics & Data-Driven Marketing', dur:'1_month', type:'paid', price:99, status:'published', sched:'evening', live:true, demo:false, skills:['GA4','Data Studio','Attribution','Funnel Analysis','Cohort Analysis'], learning:['Set up GA4 tracking properly','Build custom dashboards','Make data-driven decisions'] },
  { name:'Video Marketing & YouTube Growth', dur:'1_month', type:'paid', price:89, status:'published', sched:null, live:false, demo:true, skills:['YouTube SEO','Video Editing','Thumbnails','Scripting','Monetization'], learning:['Grow a YouTube channel from zero','Optimize videos for discovery','Monetize video content'] },
  { name:'Brand Building & Storytelling', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Brand Strategy','Visual Identity','Tone of Voice','Positioning','Narrative'], learning:['Define your brand positioning','Create compelling brand narratives','Build consistent visual identity'] },
  { name:'E-commerce Marketing & CRO', dur:'2_months', type:'paid', price:129, status:'draft', sched:'morning', live:true, demo:true, skills:['Shopify','CRO','Landing Pages','Cart Recovery','Upselling'], learning:['Optimize conversion funnels','Implement cart recovery flows','Scale e-commerce revenue'] },
];

const DATA_SCI_COURSES: CourseDef[] = [
  { name:'Python for Data Science & ML', dur:'2_months', type:'paid', price:199, status:'published', sched:'morning', live:true, demo:true, skills:['Python','Pandas','scikit-learn','NumPy','Matplotlib'], learning:['Master Python for data analysis','Build ML models with scikit-learn','Visualize data professionally'] },
  { name:'Deep Learning with TensorFlow', dur:'3_months', type:'paid', price:249, status:'published', sched:'evening', live:true, demo:true, skills:['TensorFlow','Keras','CNNs','RNNs','Transfer Learning'], learning:['Build deep neural networks','Train CNNs for image classification','Implement sequence models'] },
  { name:'Data Visualization with D3.js', dur:'1_month', type:'paid', price:89, status:'published', sched:null, live:false, demo:false, skills:['D3.js','SVG','Canvas','Interactive Charts','Dashboards'], learning:['Create interactive visualizations','Build custom chart components','Design data storytelling dashboards'] },
  { name:'Statistical Analysis & Probability', dur:'1_month', type:'paid', price:79, status:'published', sched:'morning', live:false, demo:false, skills:['Statistics','Hypothesis Testing','Regression','Bayesian','R'], learning:['Master hypothesis testing frameworks','Implement regression analysis','Apply Bayesian statistics'] },
  { name:'Natural Language Processing', dur:'2_months', type:'paid', price:179, status:'published', sched:'evening', live:true, demo:false, skills:['NLP','NLTK','spaCy','Transformers','BERT'], learning:['Build text classification pipelines','Implement sentiment analysis','Fine-tune transformer models'] },
  { name:'Computer Vision & Image Processing', dur:'2_months', type:'paid', price:169, status:'published', sched:null, live:false, demo:true, skills:['OpenCV','Image Classification','Object Detection','YOLO','Segmentation'], learning:['Process images with OpenCV','Train object detection models','Implement image segmentation'] },
  { name:'Big Data with Apache Spark', dur:'1_month', type:'paid', price:129, status:'published', sched:'morning', live:true, demo:false, skills:['Apache Spark','PySpark','Hadoop','Data Lakes','ETL'], learning:['Process big data with Spark','Build ETL pipelines','Optimize distributed queries'] },
  { name:'Time Series Analysis & Forecasting', dur:'1_month', type:'paid', price:99, status:'published', sched:null, live:false, demo:false, skills:['ARIMA','Prophet','LSTM','Seasonality','Trend Analysis'], learning:['Decompose time series data','Build forecasting models','Handle missing data & outliers'] },
  { name:'Recommender Systems', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Collaborative Filtering','Content-Based','Matrix Factorization','Cold Start','Evaluation'], learning:['Implement collaborative filtering','Build content-based recommenders','Evaluate recommendation quality'] },
  { name:'MLOps & Model Deployment', dur:'2_months', type:'paid', price:159, status:'draft', sched:'evening', live:true, demo:true, skills:['MLflow','Docker','Kubernetes','CI/CD','Model Monitoring'], learning:['Deploy ML models to production','Set up model monitoring','Automate retraining pipelines'] },
];

const MOBILE_COURSES: CourseDef[] = [
  { name:'React Native Cross-Platform Apps', dur:'2_months', type:'paid', price:139, status:'published', sched:'evening', live:true, demo:true, skills:['React Native','Expo','Navigation','Native Modules','Animations'], learning:['Build cross-platform mobile apps','Implement native navigation patterns','Create smooth animations'] },
  { name:'iOS Development with SwiftUI', dur:'2_months', type:'paid', price:149, status:'published', sched:'morning', live:true, demo:true, skills:['SwiftUI','Combine','Core Data','UIKit','TestFlight'], learning:['Build iOS apps with SwiftUI','Implement reactive data flows','Publish to the App Store'] },
  { name:'Android Development with Kotlin', dur:'2_months', type:'paid', price:139, status:'published', sched:'evening', live:true, demo:false, skills:['Kotlin','Jetpack Compose','Room DB','Coroutines','Hilt'], learning:['Build Android apps with Compose','Implement MVVM architecture','Handle background tasks'] },
  { name:'Flutter & Dart Masterclass', dur:'2_months', type:'paid', price:129, status:'published', sched:null, live:false, demo:true, skills:['Flutter','Dart','Widgets','State Management','Firebase'], learning:['Build beautiful Flutter UIs','Implement state management','Integrate with Firebase'] },
  { name:'Mobile App Architecture Patterns', dur:'1_month', type:'paid', price:89, status:'published', sched:'morning', live:false, demo:false, skills:['MVVM','Clean Architecture','DI','Repository Pattern','Modularization'], learning:['Implement clean architecture','Design scalable module structures','Apply dependency injection'] },
  { name:'Mobile Testing & QA', dur:'2_weeks', type:'paid', price:59, status:'published', sched:null, live:false, demo:false, skills:['Jest','Detox','Appium','Unit Testing','E2E Testing'], learning:['Write comprehensive unit tests','Implement E2E test suites','Set up CI testing pipelines'] },
  { name:'Mobile Performance Optimization', dur:'2_weeks', type:'paid', price:69, status:'published', sched:'evening', live:false, demo:false, skills:['Profiling','Memory Optimization','Bundle Size','Lazy Loading','Caching'], learning:['Profile and optimize performance','Reduce app bundle size','Implement efficient caching'] },
  { name:'Push Notifications & Real-time Features', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['FCM','APNs','WebSockets','SSE','Background Sync'], learning:['Implement push notifications','Build real-time chat features','Handle background data sync'] },
  { name:'Mobile Security & App Hardening', dur:'2_weeks', type:'free', price:0, status:'published', sched:null, live:false, demo:false, skills:['Encryption','SSL Pinning','Keychain','ProGuard','Jailbreak Detection'], learning:['Secure data storage','Implement SSL certificate pinning','Protect against reverse engineering'] },
  { name:'App Store Optimization (ASO)', dur:'1_month', type:'paid', price:79, status:'draft', sched:'morning', live:false, demo:false, skills:['ASO','Keywords','Screenshots','A/B Testing','Ratings'], learning:['Optimize app store listings','Design converting screenshots','Improve app ratings & reviews'] },
];

// ─── Category quiz question banks ──────────────────────────────────────────────
interface QuizQ { questionType:'mcq'|'essay'; question:string; marks:number; options:string[]; correctOption:string; correctAnswer:string; }

const WEBDEV_QUESTIONS: QuizQ[] = [
  { questionType:'mcq', question:'Which HTTP method is idempotent and used to update resources?', marks:5, options:['PUT','POST','PATCH','DELETE'], correctOption:'PUT', correctAnswer:'' },
  { questionType:'mcq', question:'What HTTP status code indicates a resource was successfully created?', marks:5, options:['201','200','204','301'], correctOption:'201', correctAnswer:'' },
  { questionType:'mcq', question:'Which NestJS decorator marks a class as injectable?', marks:5, options:['@Injectable()','@Module()','@Controller()','@Guard()'], correctOption:'@Injectable()', correctAnswer:'' },
  { questionType:'mcq', question:'What does CORS stand for?', marks:5, options:['Cross-Origin Resource Sharing','Cross-Origin Request Security','Client-Origin Resource Sharing','Cross-Object Request System'], correctOption:'Cross-Origin Resource Sharing', correctAnswer:'' },
  { questionType:'mcq', question:'Which React hook is used for side effects?', marks:5, options:['useEffect','useState','useMemo','useRef'], correctOption:'useEffect', correctAnswer:'' },
  { questionType:'mcq', question:'What command initializes a new Node.js project?', marks:5, options:['npm init','npm start','npm install','npm create'], correctOption:'npm init', correctAnswer:'' },
  { questionType:'mcq', question:'Which MongoDB operator adds an element to an array only if it does not already exist?', marks:5, options:['$addToSet','$push','$append','$insert'], correctOption:'$addToSet', correctAnswer:'' },
  { questionType:'essay', question:'Explain the difference between authentication and authorization with real-world examples.', marks:10, options:[], correctOption:'', correctAnswer:'Authentication verifies identity (login), authorization checks permissions (admin vs user access).' },
];
const DESIGN_QUESTIONS: QuizQ[] = [
  { questionType:'mcq', question:'What does HSL stand for in CSS color representation?', marks:5, options:['Hue Saturation Lightness','High Standard Low','Hex Style Layout','Hue Shade Luminance'], correctOption:'Hue Saturation Lightness', correctAnswer:'' },
  { questionType:'mcq', question:'Which design principle describes visual weight distribution?', marks:5, options:['Balance','Contrast','Proximity','Alignment'], correctOption:'Balance', correctAnswer:'' },
  { questionType:'mcq', question:'What is the recommended minimum touch target size for mobile?', marks:5, options:['44x44 points','20x20 points','100x100 points','10x10 points'], correctOption:'44x44 points', correctAnswer:'' },
  { questionType:'mcq', question:'Which Figma feature allows responsive component behavior?', marks:5, options:['Auto Layout','Smart Animate','Variants','Plugins'], correctOption:'Auto Layout', correctAnswer:'' },
  { questionType:'mcq', question:'What WCAG level is commonly required for legal compliance?', marks:5, options:['AA','A','AAA','B'], correctOption:'AA', correctAnswer:'' },
  { questionType:'mcq', question:'Which color contrast ratio is minimum for WCAG AA normal text?', marks:5, options:['4.5:1','3:1','7:1','2:1'], correctOption:'4.5:1', correctAnswer:'' },
  { questionType:'essay', question:'Describe the double diamond design process and how each phase contributes to a better product.', marks:10, options:[], correctOption:'', correctAnswer:'Discover, Define, Develop, Deliver — diverge and converge twice to find the right problem and the right solution.' },
];
const MARKETING_QUESTIONS: QuizQ[] = [
  { questionType:'mcq', question:'What does SEO stand for?', marks:5, options:['Search Engine Optimization','Social Engagement Optimization','Site Experience Optimization','Search Entry Operation'], correctOption:'Search Engine Optimization', correctAnswer:'' },
  { questionType:'mcq', question:'Which Google Ads bidding strategy maximizes conversions?', marks:5, options:['Target CPA','Manual CPC','Target Impression Share','CPM'], correctOption:'Target CPA', correctAnswer:'' },
  { questionType:'mcq', question:'What is a good email open rate benchmark?', marks:5, options:['20-25%','5-10%','50-60%','70-80%'], correctOption:'20-25%', correctAnswer:'' },
  { questionType:'mcq', question:'Which metric measures the percentage of visitors who complete a goal?', marks:5, options:['Conversion Rate','Bounce Rate','Click-Through Rate','Impression Rate'], correctOption:'Conversion Rate', correctAnswer:'' },
  { questionType:'mcq', question:'What does CTA stand for in marketing?', marks:5, options:['Call To Action','Click Through Analytics','Content Targeting Approach','Conversion Tracking API'], correctOption:'Call To Action', correctAnswer:'' },
  { questionType:'essay', question:'Compare content marketing and paid advertising. When would you choose one over the other?', marks:10, options:[], correctOption:'', correctAnswer:'Content marketing builds long-term organic traffic while paid ads drive immediate results. Choose based on timeline and budget.' },
];
const DATASCI_QUESTIONS: QuizQ[] = [
  { questionType:'mcq', question:'Which Python library is primarily used for data manipulation?', marks:5, options:['Pandas','NumPy','Matplotlib','Seaborn'], correctOption:'Pandas', correctAnswer:'' },
  { questionType:'mcq', question:'What type of ML algorithm is Linear Regression?', marks:5, options:['Supervised','Unsupervised','Reinforcement','Semi-supervised'], correctOption:'Supervised', correctAnswer:'' },
  { questionType:'mcq', question:'Which metric is best for imbalanced classification problems?', marks:5, options:['F1 Score','Accuracy','MSE','R-squared'], correctOption:'F1 Score', correctAnswer:'' },
  { questionType:'mcq', question:'What does CNN stand for in deep learning?', marks:5, options:['Convolutional Neural Network','Connected Node Network','Computed Neuron Network','Central Neural Node'], correctOption:'Convolutional Neural Network', correctAnswer:'' },
  { questionType:'mcq', question:'Which technique prevents overfitting in neural networks?', marks:5, options:['Dropout','Pooling','Activation','Convolution'], correctOption:'Dropout', correctAnswer:'' },
  { questionType:'mcq', question:'What is the purpose of feature scaling?', marks:5, options:['Normalize feature ranges','Increase features','Remove features','Add noise'], correctOption:'Normalize feature ranges', correctAnswer:'' },
  { questionType:'essay', question:'Explain the bias-variance tradeoff and how it affects model selection.', marks:10, options:[], correctOption:'', correctAnswer:'High bias = underfitting, high variance = overfitting. Good models balance both for generalization.' },
];
const MOBILE_QUESTIONS: QuizQ[] = [
  { questionType:'mcq', question:'Which state management solution is recommended for React Native?', marks:5, options:['Redux Toolkit','jQuery','Angular Services','Vuex'], correctOption:'Redux Toolkit', correctAnswer:'' },
  { questionType:'mcq', question:'What is the recommended architecture pattern for Android apps?', marks:5, options:['MVVM','MVC','Singleton','Monolith'], correctOption:'MVVM', correctAnswer:'' },
  { questionType:'mcq', question:'Which testing framework is used for React Native E2E tests?', marks:5, options:['Detox','JUnit','XCTest','Espresso'], correctOption:'Detox', correctAnswer:'' },
  { questionType:'mcq', question:'What does APNs stand for?', marks:5, options:['Apple Push Notification service','Android Push Notification system','App Push Network service','Auto Push Notify system'], correctOption:'Apple Push Notification service', correctAnswer:'' },
  { questionType:'mcq', question:'Which Flutter widget is used for scrollable lists?', marks:5, options:['ListView','Column','Stack','Container'], correctOption:'ListView', correctAnswer:'' },
  { questionType:'essay', question:'Compare React Native and Flutter. What are the key advantages of each framework?', marks:10, options:[], correctOption:'', correctAnswer:'React Native uses JS/React with native modules. Flutter uses Dart with its own rendering engine for pixel-perfect control.' },
];

const QUESTION_BANKS = [WEBDEV_QUESTIONS, DESIGN_QUESTIONS, MARKETING_QUESTIONS, DATASCI_QUESTIONS, MOBILE_QUESTIONS];

// ─── Enrollment matrix: [studentIndex] => courseGlobalIndices[] ─────────────────
// Courses indexed 0-49: 0-9=WebDev, 10-19=Design, 20-29=Marketing, 30-39=DataSci, 40-49=Mobile
const ENROLLMENT_MAP: number[][] = [
  /* Student 1 (Rahul) — 15 courses */  [0,1,2,3,4,  10,11,12,  20,21,22,  30,31,  40],
  /* Student 2 (Ananya) — 11 courses */  [0,1,  10,11,12,13,  20,21,  30,  40,41],
  /* Student 3 (Vikram) — 8 courses */   [0,1,2,  10,  20,  30,31,32],
  /* Student 4 (Sneha) — 6 courses */    [0,  10,11,  20,  30,  40],
  /* Student 5 (Aditya) — 5 courses */   [0,  10,  20,  30,  40],
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════
async function seed() {
  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI!);
  const db = mongoose.connection.db!;
  console.log('✅ Connected');

  console.log('🗑️  Dropping database…');
  await db.dropDatabase();
  console.log('✅ Database dropped\n');

  const now = new Date();
  const hashed = await bcrypt.hash('Password123!', 10);

  // ═══ 1. Categories ═══════════════════════════════════════════════════════════
  console.log('📂 Seeding 5 categories…');
  await db.collection('categories').insertMany([
    { _id: catWebDevId, category_name: 'Web Development', description: 'Full-stack, frontend, and backend web technologies', isActive: true, createdAt: now, updatedAt: now },
    { _id: catDesignId, category_name: 'UI/UX Design', description: 'User interface and experience design', isActive: true, createdAt: now, updatedAt: now },
    { _id: catMarketingId, category_name: 'Digital Marketing', description: 'SEO, ads, social media, and analytics', isActive: true, createdAt: now, updatedAt: now },
    { _id: catDataSciId, category_name: 'Data Science', description: 'ML, statistics, and data engineering', isActive: true, createdAt: now, updatedAt: now },
    { _id: catMobileId, category_name: 'Mobile Development', description: 'iOS, Android, and cross-platform apps', isActive: true, createdAt: now, updatedAt: now },
  ]);

  // ═══ 2. Organisations ════════════════════════════════════════════════════════
  console.log('🏢 Seeding 2 organisations…');
  await db.collection('organisations').insertMany([
    { _id: org1Id, name: 'TechEd Academy', email: 'admin@techedacademy.com', photo_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=256&auto=format&fit=crop', number_of_teachers: 3, organization_type: 'Education', createdAt: now, updatedAt: now },
    { _id: org2Id, name: 'Creative Labs Institute', email: 'hello@creativelabs.edu', photo_url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=256&auto=format&fit=crop', number_of_teachers: 2, organization_type: 'Education', createdAt: now, updatedAt: now },
  ]);

  // ═══ 3. Teacher profiles ═════════════════════════════════════════════════════
  console.log('👨‍🏫 Seeding 5 teacher profiles…');
  await db.collection('teachers').insertMany([
    { _id: tp_instr1, firstName: 'Gursewak', lastName: 'Singh', gender: 'Male', dob: '1995-04-15', maritalStatus: 'Single', email: 'instructor@lms.com', phone: '+919876543210', qualification: 'M.Tech Computer Science', expertIn: ['Full-Stack Development','System Design','Cloud Architecture'], photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop', organisationId: org1Id, createdAt: now, updatedAt: now },
    { _id: tp_instr2, firstName: 'Meera', lastName: 'Kapoor', gender: 'Female', dob: '1993-11-08', maritalStatus: 'Single', email: 'instructor2@lms.com', phone: '+919876543212', qualification: 'MBA Marketing & Design', expertIn: ['UI/UX Design','Digital Marketing','Brand Strategy'], photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&auto=format&fit=crop', organisationId: org2Id, createdAt: now, updatedAt: now },
    { _id: tp_teach1, firstName: 'Priya', lastName: 'Sharma', gender: 'Female', dob: '1998-08-22', maritalStatus: 'Single', email: 'teacher@lms.com', phone: '+919876543211', qualification: 'B.Tech CSE', expertIn: ['Node.js','React','TypeScript'], photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop', organisationId: org1Id, createdAt: now, updatedAt: now },
    { _id: tp_teach2, firstName: 'Rohan', lastName: 'Mehta', gender: 'Male', dob: '1996-03-14', maritalStatus: 'Single', email: 'teacher2@lms.com', phone: '+919876543213', qualification: 'B.Des Visual Communication', expertIn: ['Figma','Design Systems','Prototyping'], photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&auto=format&fit=crop', organisationId: org2Id, createdAt: now, updatedAt: now },
    { _id: tp_teach3, firstName: 'Kavya', lastName: 'Reddy', gender: 'Female', dob: '1997-06-30', maritalStatus: 'Single', email: 'teacher3@lms.com', phone: '+919876543214', qualification: 'M.Sc Data Science', expertIn: ['Python','Machine Learning','Data Visualization'], photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=256&auto=format&fit=crop', organisationId: org1Id, createdAt: now, updatedAt: now },
  ]);

  // ═══ 4. Users ════════════════════════════════════════════════════════════════
  console.log('👥 Seeding 10 users…');
  const makeUser = (id: Types.ObjectId, email: string, first: string, last: string, role: string, orgId: Types.ObjectId|null, teacherId: Types.ObjectId|null, batchIds: Types.ObjectId[], opts: Partial<{career:string;topics:string[];education:string;subscribed:boolean;img:string}> = {}) => ({
    _id: id, email, password: hashed, firstName: first, lastName: last, role,
    onboardingStatus: 'complete', isSubscribed: opts.subscribed ?? true, provider: 'local',
    profileImg: opts.img ?? null, career: opts.career ?? null, topics: opts.topics ?? [],
    educationLevel: opts.education ?? null, organisationId: orgId, teacherId, batchIds,
    resetOtp: null, resetOtpExpiry: null, createdAt: now, updatedAt: now,
  });

  // Batch IDs will be filled after course generation — we'll update users later
  await db.collection('users').insertMany([
    makeUser(adminId, 'admin@lms.com', 'Admin', 'User', 'admin', null, null, [], { img:'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&auto=format&fit=crop' }),
    makeUser(instructor1Id, 'instructor@lms.com', 'Gursewak', 'Singh', 'instructor', org1Id, tp_instr1, [], { img:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop' }),
    makeUser(instructor2Id, 'instructor2@lms.com', 'Meera', 'Kapoor', 'instructor', org2Id, tp_instr2, [], { img:'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&auto=format&fit=crop' }),
    makeUser(teacher1Id, 'teacher@lms.com', 'Priya', 'Sharma', 'teacher', org1Id, tp_teach1, []),
    makeUser(teacher2Id, 'teacher2@lms.com', 'Rohan', 'Mehta', 'teacher', org2Id, tp_teach2, []),
    makeUser(teacher3Id, 'teacher3@lms.com', 'Kavya', 'Reddy', 'teacher', org1Id, tp_teach3, []),
    makeUser(student1Id, 'student@lms.com', 'Rahul', 'Kumar', 'student', null, null, [], { career:'Software Engineering', topics:['Web Development','Data Science'], education:'Bachelor Degree', img:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&auto=format&fit=crop' }),
    makeUser(student2Id, 'student2@lms.com', 'Ananya', 'Patel', 'student', null, null, [], { career:'UI/UX Design', topics:['UI/UX Design','Mobile Development'], education:'Master Degree', img:'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=256&auto=format&fit=crop' }),
    makeUser(student3Id, 'student3@lms.com', 'Vikram', 'Joshi', 'student', null, null, [], { career:'Data Engineering', topics:['Web Development','Data Science'], education:'Bachelor Degree', img:'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=256&auto=format&fit=crop' }),
    makeUser(student4Id, 'student4@lms.com', 'Sneha', 'Gupta', 'student', null, null, [], { career:'Product Design', topics:['UI/UX Design','Digital Marketing'], education:'Master Degree', subscribed:false, img:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=256&auto=format&fit=crop' }),
    makeUser(student5Id, 'student5@lms.com', 'Aditya', 'Rao', 'student', null, null, [], { career:'Mobile Development', topics:['Mobile Development','Web Development'], education:'Bachelor Degree', subscribed:false, img:'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=256&auto=format&fit=crop' }),
  ]);

  // ═══ 5–14. Generate courses & all related data ══════════════════════════════
  const allCategoryDefs: { catId: Types.ObjectId; orgId: Types.ObjectId; instructorUserId: Types.ObjectId; instructorTeacherId: Types.ObjectId; teachers: Types.ObjectId[]; courses: CourseDef[]; images: string[]; qBank: QuizQ[] }[] = [
    { catId: catWebDevId, orgId: org1Id, instructorUserId: instructor1Id, instructorTeacherId: tp_instr1, teachers: [tp_teach1, tp_teach3], courses: WEB_DEV_COURSES, images: webDevImages, qBank: WEBDEV_QUESTIONS },
    { catId: catDesignId, orgId: org2Id, instructorUserId: instructor2Id, instructorTeacherId: tp_instr2, teachers: [tp_teach2], courses: DESIGN_COURSES, images: designImages, qBank: DESIGN_QUESTIONS },
    { catId: catMarketingId, orgId: org2Id, instructorUserId: instructor2Id, instructorTeacherId: tp_instr2, teachers: [tp_teach2], courses: MARKETING_COURSES, images: marketingImages, qBank: MARKETING_QUESTIONS },
    { catId: catDataSciId, orgId: org1Id, instructorUserId: instructor1Id, instructorTeacherId: tp_instr1, teachers: [tp_teach3, tp_teach1], courses: DATA_SCI_COURSES, images: dataSciImages, qBank: DATASCI_QUESTIONS },
    { catId: catMobileId, orgId: org1Id, instructorUserId: instructor1Id, instructorTeacherId: tp_instr1, teachers: [tp_teach1], courses: MOBILE_COURSES, images: mobileImages, qBank: MOBILE_QUESTIONS },
  ];

  const allCourseDocs: any[] = [];
  const allBatchDocs: any[] = [];
  const allLessonDocs: any[] = [];
  const allSublessonDocs: any[] = [];
  const allEnrollmentDocs: any[] = [];
  const allAssignmentDocs: any[] = [];
  const allQuizDocs: any[] = [];
  const allAnnouncementDocs: any[] = [];
  const allScheduleDocs: any[] = [];
  const allChatGroupDocs: any[] = [];
  const allChatMessageDocs: any[] = [];
  const allOrderDocs: any[] = [];
  const allReviewDocs: any[] = [];
  const allCartDocs: any[] = [];
  const allProgressDocs: any[] = [];
  const allCertDocs: any[] = [];
  const allFavDocs: any[] = [];

  // Track course data for cross-referencing
  interface CourseRecord { courseId: Types.ObjectId; batchId: Types.ObjectId; chatGroupId: Types.ObjectId; globalIdx: number; def: CourseDef; catDef: typeof allCategoryDefs[0]; lessonIds: Types.ObjectId[] }
  const courseRecords: CourseRecord[] = [];

  let globalCourseIdx = 0;

  for (const catDef of allCategoryDefs) {
    for (let ci = 0; ci < catDef.courses.length; ci++) {
      const c = catDef.courses[ci];
      const courseId = nextId();
      const batchId = nextId();
      const chatGroupId = nextId();
      const batchTeacher = ci < catDef.teachers.length ? catDef.teachers[ci] : catDef.instructorTeacherId;
      const batchTeacherName = batchTeacher === tp_teach1 ? 'Priya Sharma' : batchTeacher === tp_teach2 ? 'Rohan Mehta' : batchTeacher === tp_teach3 ? 'Kavya Reddy' : batchTeacher === tp_instr1 ? 'Gursewak Singh' : 'Meera Kapoor';
      const batchName = `${c.name.split(' ').slice(0, 3).join(' ')} — Batch ${ci + 1}`;

      // Count enrollments for this course
      let enrolledCount = 0;
      for (let si = 0; si < 5; si++) {
        if (ENROLLMENT_MAP[si].includes(globalCourseIdx)) enrolledCount++;
      }

      allCourseDocs.push({
        _id: courseId,
        course_name: c.name,
        head_teacher: catDef.instructorTeacherId,
        duration: c.dur,
        course_type: c.type,
        course_price: c.price,
        demo_class: c.demo,
        category_id: catDef.catId,
        course_schedule: c.sched,
        live_classes: c.live,
        batch: [{ _id: batchId, batchName, teacher: batchTeacherName }],
        course_image_url: imgUrl(catDef.images[ci]),
        learning_points: c.learning,
        skills_you_gain: c.skills,
        about_course: `Comprehensive curriculum for ${c.name}. Master essential concepts through hands-on projects and real-world applications.`,
        instructor_id: catDef.instructorTeacherId,
        description: `Learn ${c.name} from industry experts with project-based learning and mentorship.`,
        overview: `Welcome to ${c.name}! Build your expertise, gain practical skills, and advance your career.`,
        course_status: c.status,
        enrolled_user_count: enrolledCount,
        average_rating: enrolledCount > 0 ? +(3.8 + Math.random()).toFixed(1) : 0,
        review_count: enrolledCount > 0 ? Math.floor(enrolledCount * 2 + Math.random() * 5) : 0,
        organisation_id: catDef.orgId,
        created_by: catDef.instructorUserId,
        createdAt: now, updatedAt: now,
      });

      allBatchDocs.push({
        _id: batchId,
        name: batchName,
        course_id: courseId,
        teacher_id: batchTeacher,
        organisation_id: catDef.orgId,
        chat_group_id: enrolledCount > 0 ? chatGroupId : null,
        createdAt: now, updatedAt: now,
      });

      // Lessons (2 per course)
      const lesson1Id = nextId();
      const lesson2Id = nextId();
      allLessonDocs.push(
        { _id: lesson1Id, course_id: courseId, lesson_name: `Getting Started with ${c.skills[0]}`, lesson_description: `Foundation concepts of ${c.skills[0]} — setting up your environment and understanding core principles.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], unlock_after_previous: false, uploaded_at: now, createdAt: now, updatedAt: now },
        { _id: lesson2Id, course_id: courseId, lesson_name: `Mastering ${c.skills[1] || c.skills[0]}`, lesson_description: `Advanced techniques in ${c.skills[1] || c.skills[0]} with hands-on projects and best practices.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], unlock_after_previous: true, uploaded_at: now, createdAt: now, updatedAt: now },
      );

      // Sublessons (2 per lesson = 4 per course)
      allSublessonDocs.push(
        { _id: nextId(), course_id: courseId, lesson_id: lesson1Id, sublesson_name: `${c.skills[0]} Fundamentals`, sublesson_description: `Core concepts and setup for ${c.skills[0]}.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], duration: '45 min', uploaded_at: now, createdAt: now, updatedAt: now },
        { _id: nextId(), course_id: courseId, lesson_id: lesson1Id, sublesson_name: `${c.skills[0]} in Practice`, sublesson_description: `Hands-on exercises applying ${c.skills[0]} concepts.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], duration: '60 min', uploaded_at: now, createdAt: now, updatedAt: now },
        { _id: nextId(), course_id: courseId, lesson_id: lesson2Id, sublesson_name: `Advanced ${c.skills[1] || c.skills[0]}`, sublesson_description: `Deep dive into advanced ${c.skills[1] || c.skills[0]} patterns.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], duration: '50 min', uploaded_at: now, createdAt: now, updatedAt: now },
        { _id: nextId(), course_id: courseId, lesson_id: lesson2Id, sublesson_name: `${c.skills[1] || c.skills[0]} Best Practices`, sublesson_description: `Industry best practices and common pitfalls.`, file_url: null, file_name: null, file_type: null, studyMaterials: [], duration: '40 min', uploaded_at: now, createdAt: now, updatedAt: now },
      );

      const rec: CourseRecord = { courseId, batchId, chatGroupId, globalIdx: globalCourseIdx, def: c, catDef, lessonIds: [lesson1Id, lesson2Id] };
      courseRecords.push(rec);

      // Enrollments
      const enrolledStudentIds: Types.ObjectId[] = [];
      for (let si = 0; si < 5; si++) {
        if (ENROLLMENT_MAP[si].includes(globalCourseIdx)) {
          enrolledStudentIds.push(students[si]._id);
          allEnrollmentDocs.push({ student_id: students[si]._id, batch_id: batchId, course_id: courseId, createdAt: now, updatedAt: now });
        }
      }

      // Chat group (only for courses with enrollments)
      if (enrolledStudentIds.length > 0) {
        const teacherUserId =
          batchTeacher === tp_teach1
            ? teacher1Id
            : batchTeacher === tp_teach2
            ? teacher2Id
            : batchTeacher === tp_teach3
            ? teacher3Id
            : catDef.instructorUserId;

        allChatGroupDocs.push({
          _id: chatGroupId,
          name: batchName,
          course_id: courseId,
          batch_id: batchId,
          members: Array.from(
            new Set([catDef.instructorUserId, teacherUserId, ...enrolledStudentIds]),
          ),
          createdAt: now,
          updatedAt: now,
        });
      }

      // Assignments (for published courses with enrollments, indices 0-7)
      if (c.status === 'published' && ci < 8 && enrolledStudentIds.length > 0) {
        allAssignmentDocs.push({
          _id: nextId(),
          assignmentName: `${c.name} — Practical Assignment`,
          dueDate: new Date(Date.now() + (7 + ci * 2) * 24 * 60 * 60 * 1000),
          overview: `Apply your knowledge of ${c.skills.slice(0, 3).join(', ')} by building a real-world project. This assignment tests both theoretical understanding and practical implementation.`,
          courseId, batchId: String(batchId), organisationId: catDef.orgId, created_by: catDef.instructorUserId,
          projects: [
            { projectName: `Part 1: ${c.skills[0]} Implementation`, description: `Build a working module using ${c.skills[0]}`, objectives: [`Set up ${c.skills[0]} project structure`, `Implement core functionality`, 'Write documentation'], enableButton: true },
            { projectName: `Part 2: Integration & Testing`, description: `Integrate with ${c.skills[1] || 'other tools'} and test`, objectives: ['Connect components together', 'Write test cases', 'Deploy and demo'], enableButton: true },
          ],
          status: 'published', createdAt: now, updatedAt: now,
        });
      }

      // Quizzes (for published courses with enrollments, indices 0-7)
      if (c.status === 'published' && ci < 8 && enrolledStudentIds.length > 0) {
        const qStart = (ci * 3) % catDef.qBank.length;
        const questions: QuizQ[] = [];
        for (let qi = 0; qi < 4; qi++) {
          questions.push(catDef.qBank[(qStart + qi) % catDef.qBank.length]);
        }
        allQuizDocs.push({
          _id: nextId(),
          quizName: `${c.name} — Assessment Quiz`,
          dueDate: new Date(Date.now() + (5 + ci * 2) * 24 * 60 * 60 * 1000),
          quizType: questions.some(q => q.questionType === 'essay') ? 'mixed' : 'mcq',
          overview: `Test your understanding of ${c.name} concepts.`,
          enableTimer: true, timer: '00:30',
          courseId, batchId: String(batchId), organisationId: catDef.orgId, created_by: catDef.instructorUserId,
          questions, status: 'published', createdAt: now, updatedAt: now,
        });
      }

      // Announcements (for first 5 courses per category)
      if (ci < 5 && c.status === 'published') {
        allAnnouncementDocs.push({
          _id: nextId(),
          title: `Welcome to ${c.name}!`,
          message: `Hello everyone! Welcome to the course. Please review the syllabus and join the batch chat. Our first session covers ${c.skills[0]}. Don't forget to complete the setup before class!`,
          courseId, batchId: String(batchId), instructorId: catDef.instructorUserId,
          status: 'published', scheduledAt: null, publishedAt: now, createdAt: now, updatedAt: now,
        });
      }
      if (ci < 3 && c.status === 'published') {
        allAnnouncementDocs.push({
          _id: nextId(),
          title: `Assignment Deadline Approaching — ${c.name}`,
          message: `Reminder: Your practical assignment for ${c.name} is due soon. Please submit your work on time. Reach out in the chat group if you have questions.`,
          courseId, batchId: null, instructorId: catDef.instructorUserId,
          status: 'published', scheduledAt: null, publishedAt: now, createdAt: now, updatedAt: now,
        });
      }

      // Schedules (for first 5 courses per category with live classes)
      if (ci < 5 && c.status === 'published') {
        const schedDate = new Date(now);
        schedDate.setDate(schedDate.getDate() + ci + 1);
        schedDate.setHours(0, 0, 0, 0);
        allScheduleDocs.push({
          _id: nextId(),
          title: `${c.name} — Live Session`,
          description: `Hands-on session covering ${c.skills.slice(0, 2).join(' & ')}.`,
          date: schedDate, startTime: c.sched === 'morning' ? '10:00' : '18:00', endTime: c.sched === 'morning' ? '11:30' : '19:30',
          courseId, batchId: String(batchId), createdBy: catDef.instructorUserId, organisationId: catDef.orgId,
          meetingLink: `https://meet.google.com/lms-${c.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`,
          createdAt: now, updatedAt: now,
        });
      }

      // Chat messages (for first 3 courses per category with enrollments)
      if (ci < 3 && enrolledStudentIds.length > 0) {
        const instrName = catDef.instructorUserId === instructor1Id ? 'Gursewak Singh' : 'Meera Kapoor';
        allChatMessageDocs.push(
          { group_id: chatGroupId, sender_id: catDef.instructorUserId, sender_name: instrName, message: `Welcome to ${batchName}! Let's make this an amazing learning experience. Feel free to ask questions here anytime.`, createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), updatedAt: now },
          { group_id: chatGroupId, sender_id: enrolledStudentIds[0], sender_name: students[ENROLLMENT_MAP.findIndex(m => m.includes(globalCourseIdx))].name, message: `Thanks for the welcome! Really excited to start learning ${c.skills[0]}. Any pre-requisites we should cover?`, createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), updatedAt: now },
          { group_id: chatGroupId, sender_id: catDef.instructorUserId, sender_name: instrName, message: `Great question! Just make sure you have the tools installed as mentioned in Lesson 1. We'll walk through everything together.`, createdAt: new Date(now.getTime() - 60 * 60 * 1000), updatedAt: now },
        );
      }

      globalCourseIdx++;
    }
  }

  // ═══ Bulk inserts ═════════════════════════════════════════════════════════════
  console.log(`📚 Seeding ${allCourseDocs.length} courses…`);
  await db.collection('courses').insertMany(allCourseDocs);

  console.log(`📦 Seeding ${allBatchDocs.length} batches…`);
  await db.collection('batches').insertMany(allBatchDocs);

  console.log(`📖 Seeding ${allLessonDocs.length} lessons…`);
  await db.collection('lessons').insertMany(allLessonDocs);

  console.log(`📄 Seeding ${allSublessonDocs.length} sublessons…`);
  await db.collection('sublessons').insertMany(allSublessonDocs);

  console.log(`🎓 Seeding ${allEnrollmentDocs.length} enrollments…`);
  if (allEnrollmentDocs.length) await db.collection('batch_enrolled_students').insertMany(allEnrollmentDocs);

  console.log(`📝 Seeding ${allAssignmentDocs.length} assignments…`);
  if (allAssignmentDocs.length) await db.collection('assignments').insertMany(allAssignmentDocs);

  console.log(`❓ Seeding ${allQuizDocs.length} quizzes…`);
  if (allQuizDocs.length) await db.collection('quizzes').insertMany(allQuizDocs);

  console.log(`📢 Seeding ${allAnnouncementDocs.length} announcements…`);
  if (allAnnouncementDocs.length) await db.collection('announcements').insertMany(allAnnouncementDocs);

  console.log(`📅 Seeding ${allScheduleDocs.length} schedules…`);
  if (allScheduleDocs.length) await db.collection('schedules').insertMany(allScheduleDocs);

  console.log(`💬 Seeding ${allChatGroupDocs.length} chat groups & ${allChatMessageDocs.length} messages…`);
  if (allChatGroupDocs.length) await db.collection('chat_groups').insertMany(allChatGroupDocs);
  if (allChatMessageDocs.length) await db.collection('chat_messages').insertMany(allChatMessageDocs);

  // ═══ Additional relational data ════════════════════════════════════════════
  // Cart: Students 1,2 have unenrolled courses in cart
  console.log('🛒 Seeding carts…');
  const student1Enrolled = new Set(ENROLLMENT_MAP[0]);
  const student2Enrolled = new Set(ENROLLMENT_MAP[1]);
  // Add some unenrolled published courses to carts
  for (const rec of courseRecords) {
    if (rec.def.status !== 'published') continue;
    if (!student1Enrolled.has(rec.globalIdx) && allCartDocs.length < 3) {
      allCartDocs.push({ student_id: student1Id, course_id: rec.courseId, createdAt: now });
    }
    if (!student2Enrolled.has(rec.globalIdx) && allCartDocs.length < 5) {
      allCartDocs.push({ student_id: student2Id, course_id: rec.courseId, createdAt: now });
    }
  }
  if (allCartDocs.length) await db.collection('carts').insertMany(allCartDocs);

  // Orders (past purchases for student1 and student2)
  console.log('🧾 Seeding orders…');
  const student1PaidCourses = courseRecords.filter(r => ENROLLMENT_MAP[0].includes(r.globalIdx) && r.def.type === 'paid');
  const student2PaidCourses = courseRecords.filter(r => ENROLLMENT_MAP[1].includes(r.globalIdx) && r.def.type === 'paid');

  if (student1PaidCourses.length > 0) {
    allOrderDocs.push({
      _id: nextId(), userId: student1Id,
      courseIds: student1PaidCourses.slice(0, 5).map(r => String(r.courseId)),
      batchIds: student1PaidCourses.slice(0, 5).map(r => String(r.batchId)),
      amountCents: student1PaidCourses.slice(0, 5).reduce((s, r) => s + r.def.price * 100, 0),
      currency: 'usd', status: 'paid',
      stripeSessionId: 'cs_test_seed_student1_batch1', stripePaymentIntentId: 'pi_test_seed_student1_batch1',
      createdAt: now, updatedAt: now,
    });
  }
  if (student2PaidCourses.length > 0) {
    allOrderDocs.push({
      _id: nextId(), userId: student2Id,
      courseIds: student2PaidCourses.slice(0, 4).map(r => String(r.courseId)),
      batchIds: student2PaidCourses.slice(0, 4).map(r => String(r.batchId)),
      amountCents: student2PaidCourses.slice(0, 4).reduce((s, r) => s + r.def.price * 100, 0),
      currency: 'usd', status: 'paid',
      stripeSessionId: 'cs_test_seed_student2_batch1', stripePaymentIntentId: 'pi_test_seed_student2_batch1',
      createdAt: now, updatedAt: now,
    });
  }
  // Free enrollment orders
  const student1FreeCourses = courseRecords.filter(r => ENROLLMENT_MAP[0].includes(r.globalIdx) && r.def.type === 'free');
  for (const fc of student1FreeCourses) {
    allOrderDocs.push({
      _id: nextId(), userId: student1Id,
      courseIds: [String(fc.courseId)], batchIds: [String(fc.batchId)],
      amountCents: 0, currency: 'usd', status: 'free',
      stripeSessionId: null, stripePaymentIntentId: null,
      createdAt: now, updatedAt: now,
    });
  }
  if (allOrderDocs.length) await db.collection('orders').insertMany(allOrderDocs);

  // Course progress (student1 has partial progress on first 5 enrolled courses)
  console.log('📊 Seeding course progress…');
  for (let pi = 0; pi < 5 && pi < ENROLLMENT_MAP[0].length; pi++) {
    const rec = courseRecords[ENROLLMENT_MAP[0][pi]];
    allProgressDocs.push({
      student_id: student1Id, course_id: rec.courseId, batch_id: rec.batchId,
      completedLessons: pi < 3 ? [rec.lessonIds[0]] : [], completedMaterials: [], completedAssignments: [],
      createdAt: now, updatedAt: now,
    });
  }
  // Student 2 partial progress
  for (let pi = 0; pi < 3 && pi < ENROLLMENT_MAP[1].length; pi++) {
    const rec = courseRecords[ENROLLMENT_MAP[1][pi]];
    allProgressDocs.push({
      student_id: student2Id, course_id: rec.courseId, batch_id: rec.batchId,
      completedLessons: pi < 2 ? [rec.lessonIds[0]] : [], completedMaterials: [], completedAssignments: [],
      createdAt: now, updatedAt: now,
    });
  }
  if (allProgressDocs.length) await db.collection('course_progress').insertMany(allProgressDocs);

  // Reviews (students review courses they're enrolled in)
  console.log('⭐ Seeding reviews…');
  const reviewTexts = [
    'Excellent course! The practical projects really helped solidify my understanding.',
    'Amazing instructor — clear explanations and great examples throughout.',
    'Well-structured content with a good balance of theory and hands-on work.',
    'Highly recommended! Learned so much in a short time.',
    'Great learning experience. The community support in chat was very helpful.',
    'Thorough curriculum covering all essential topics. Worth every penny.',
    'The assignments were challenging but incredibly rewarding.',
    'Perfect for both beginners and intermediate learners.',
  ];
  let reviewIdx = 0;
  for (let si = 0; si < 3; si++) { // First 3 students leave reviews
    const enrolled = ENROLLMENT_MAP[si];
    for (let ei = 0; ei < Math.min(4, enrolled.length); ei++) { // up to 4 reviews each
      const rec = courseRecords[enrolled[ei]];
      allReviewDocs.push({
        user_id: students[si]._id, course_id: rec.courseId,
        rating: 4 + Math.floor(Math.random() * 2), // 4 or 5
        review: reviewTexts[reviewIdx % reviewTexts.length],
        createdAt: now, updatedAt: now,
      });
      reviewIdx++;
    }
  }
  if (allReviewDocs.length) await db.collection('reviews').insertMany(allReviewDocs);

  // Favorites
  console.log('❤️  Seeding favorites…');
  for (let si = 0; si < 5; si++) {
    // Each student favorites 2-3 courses they're NOT enrolled in
    const enrolled = new Set(ENROLLMENT_MAP[si]);
    let favCount = 0;
    for (const rec of courseRecords) {
      if (!enrolled.has(rec.globalIdx) && rec.def.status === 'published' && favCount < 3) {
        allFavDocs.push({ user_id: students[si]._id, course_id: rec.courseId, createdAt: now });
        favCount++;
      }
    }
  }
  if (allFavDocs.length) await db.collection('likes').insertMany(allFavDocs);

  // Certificates (student1 completed 2 courses, student2 completed 1)
  console.log('🏆 Seeding certificates…');
  const certCourses = [
    { student: student1Id, sName: 'Rahul Kumar', rec: courseRecords[ENROLLMENT_MAP[0][0]] },
    { student: student1Id, sName: 'Rahul Kumar', rec: courseRecords[ENROLLMENT_MAP[0][1]] },
    { student: student2Id, sName: 'Ananya Patel', rec: courseRecords[ENROLLMENT_MAP[1][0]] },
  ];
  for (let ci = 0; ci < certCourses.length; ci++) {
    const cc = certCourses[ci];
    allCertDocs.push({
      _id: nextId(), student_id: cc.student, course_id: cc.rec.courseId,
      course_name: cc.rec.def.name, student_name: cc.sName,
      issued_at: now, certificate_code: `CERT-${cc.rec.def.name.split(' ')[0].toUpperCase()}-2026-${cc.sName.split(' ')[0].toUpperCase()}-${ci}`,
      createdAt: now, updatedAt: now,
    });
  }
  if (allCertDocs.length) await db.collection('certificates').insertMany(allCertDocs);

  // ═══ Update student batchIds ═══════════════════════════════════════════════
  console.log('🔗 Updating student batch references…');
  for (let si = 0; si < 5; si++) {
    const batchIds = ENROLLMENT_MAP[si].map(gi => courseRecords[gi].batchId);
    await db.collection('users').updateOne({ _id: students[si]._id }, { $set: { batchIds } });
  }

  // Update teacher batchIds (assign first teacher to batches in their courses)
  const teacher1Batches = courseRecords.filter((_, i) => i < 10 || (i >= 30 && i < 40)).slice(0, 5).map(r => r.batchId);
  const teacher2Batches = courseRecords.filter((_, i) => i >= 10 && i < 30).slice(0, 5).map(r => r.batchId);
  const teacher3Batches = courseRecords.filter((_, i) => i >= 30 && i < 50).slice(0, 5).map(r => r.batchId);
  await db.collection('users').updateOne({ _id: teacher1Id }, { $set: { batchIds: teacher1Batches } });
  await db.collection('users').updateOne({ _id: teacher2Id }, { $set: { batchIds: teacher2Batches } });
  await db.collection('users').updateOne({ _id: teacher3Id }, { $set: { batchIds: teacher3Batches } });

  // ═══ Summary ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(65));
  console.log('✅ DATABASE SEEDED SUCCESSFULLY!');
  console.log('═'.repeat(65));
  console.log('\n🔑 LOGIN CREDENTIALS (Password for all: Password123!)\n');
  console.log('┌────────────────┬────────────────────────┬──────────────────────┐');
  console.log('│      Role      │         Email          │      Password        │');
  console.log('├────────────────┼────────────────────────┼──────────────────────┤');
  console.log('│ Admin          │ admin@lms.com          │ Password123!         │');
  console.log('│ Instructor 1   │ instructor@lms.com     │ Password123!         │');
  console.log('│ Instructor 2   │ instructor2@lms.com    │ Password123!         │');
  console.log('│ Teacher 1      │ teacher@lms.com        │ Password123!         │');
  console.log('│ Teacher 2      │ teacher2@lms.com       │ Password123!         │');
  console.log('│ Teacher 3      │ teacher3@lms.com       │ Password123!         │');
  console.log('│ Student 1      │ student@lms.com        │ Password123!         │');
  console.log('│ Student 2      │ student2@lms.com       │ Password123!         │');
  console.log('│ Student 3      │ student3@lms.com       │ Password123!         │');
  console.log('│ Student 4      │ student4@lms.com       │ Password123!         │');
  console.log('│ Student 5      │ student5@lms.com       │ Password123!         │');
  console.log('└────────────────┴────────────────────────┴──────────────────────┘');
  console.log('\n📊 Seeded Data Summary:');
  console.log(`   • 5  Categories`);
  console.log(`   • 2  Organisations (TechEd Academy, Creative Labs Institute)`);
  console.log(`   • 11 Users (1 admin, 2 instructors, 3 teachers, 5 students)`);
  console.log(`   • 5  Teacher Profiles`);
  console.log(`   • ${allCourseDocs.length}  Courses (10 per category; mix of published/draft/free/paid)`);
  console.log(`   • ${allBatchDocs.length}  Batches`);
  console.log(`   • ${allEnrollmentDocs.length}  Enrollments`);
  console.log(`   • ${allLessonDocs.length} Lessons, ${allSublessonDocs.length} Sublessons`);
  console.log(`   • ${allAssignmentDocs.length}  Assignments, ${allQuizDocs.length} Quizzes`);
  console.log(`   • ${allAnnouncementDocs.length}  Announcements, ${allScheduleDocs.length} Schedules`);
  console.log(`   • ${allChatGroupDocs.length}  Chat Groups, ${allChatMessageDocs.length} Chat Messages`);
  console.log(`   • ${allCartDocs.length}  Cart Items, ${allOrderDocs.length} Orders`);
  console.log(`   • ${allProgressDocs.length}  Progress Records, ${allReviewDocs.length} Reviews`);
  console.log(`   • ${allFavDocs.length}  Favorites, ${allCertDocs.length} Certificates\n`);

  console.log('📌 Student Enrollment Distribution:');
  for (let si = 0; si < 5; si++) {
    console.log(`   • ${students[si].name}: enrolled in ${ENROLLMENT_MAP[si].length} courses`);
  }

  console.log('\n📌 Organisations:');
  console.log('   • TechEd Academy → Web Dev (10), Data Science (10), Mobile (10)');
  console.log('   • Creative Labs  → UI/UX Design (10), Marketing (10)\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

seed().catch((err) => { console.error('❌ Seed failed:', err); process.exit(1); });
