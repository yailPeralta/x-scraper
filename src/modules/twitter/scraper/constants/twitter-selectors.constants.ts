export const TWITTER_SELECTORS = {
  LOGIN: {
    USERNAME_INPUT: 'input[autocomplete="username"]',
    PASSWORD_INPUT: 'input[name="password"]',
    NEXT_BUTTON: 'button:has-text("Next")',
    LOGIN_BUTTON: 'button[data-testid="LoginForm_Login_Button"]',
  },
  TWEET: {
    ARTICLE: 'article[data-testid="tweet"]',
    TEXT: '[data-testid="tweetText"]',
    AUTHOR_NAME: '[data-testid="User-Name"]',
    TIMESTAMP: 'time',
    LIKE_COUNT: '[data-testid="like"]',
    RETWEET_COUNT: '[data-testid="retweet"]',
    REPLY_COUNT: '[data-testid="reply"]',
    VIEW_COUNT: 'a[href*="/analytics"]',
    MEDIA: '[data-testid="tweetPhoto"]',
    VERIFIED_BADGE: '[data-testid="icon-verified"]',
    SHOW_MORE_BUTTON: '[data-testid="tweet-text-show-more-link"]',
    USER_AVATAR: '[data-testid="Tweet-User-Avatar"]',
    SOCIAL_CONTEXT: '[data-testid="socialContext"]',
    ARIA_LABELLEDBY: 'div[aria-labelledby]',
    VIDEO_COMPONENT: '[data-testid="videoComponent"]'
  },
  PROFILE: {
    USERNAME: '[data-testid="UserName"]',
    BIO: '[data-testid="UserDescription"]',
    FOLLOWERS:
      'a[href$="/verified_followers"] span, a[href$="/followers"] span',
    FOLLOWING: 'a[href$="/following"] span',
    PROFILE_IMAGE: '[data-testid="UserAvatar-Container-"] img',
    LOCATION: '[data-testid="UserLocation"]',
    JOIN_DATE: '[data-testid="UserJoinDate"]',
    VERIFIED: '[data-testid="icon-verified"]',
    BANNERS: 'img[src*="profile_banners"]',
    IMAGES: 'img[src*="profile_images"]',
    ABOUT_ITEM: 'div[role="tab"][data-testid="pivot"]'
  },
  SEARCH: {
    INPUT: 'input[data-testid="SearchBox_Search_Input"]',
    RESULT: '[data-testid="cellInnerDiv"]',
  },
  TRENDING: {
    TOPIC_BUTTON: 'button[class="jf-element"]',
    TOPIC_LABEL: 'p[class="jf-element"]',
    TWEET_ARTICLE: 'article[data-testid="tweet"]',
  },
};
