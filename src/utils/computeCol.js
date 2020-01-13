const computeCategory = (keyword, _index) => {
  switch (_index) {
    case 'paycoin_raw':
      return getPaycoinKeyword(keyword)
    case 'nii_raw':
      return getNiiKeyword(keyword)
    default:
      return 'default'
  }
}

const getNiiKeyword = keyword => {
  switch (keyword) {
    case '캐주얼 패션':
    case '스트릿 캐주얼':
    case '패밀리룩':
      return 'industry'
    case 'NII':
    case '엔아이아이':
      return 'nii'
    case '커버낫':
    case '라퍼지스토어':
    case '스컬프터':
    case '폴햄':
    case '클라이드앤':
    case '스파오':
    case '지프 옷':
    case '지프 의류':
    case 'jeep 옷':
    case 'jeep 의류':
      return 'competition'
  }
}
const getPaycoinKeyword = keyword => {
  switch (keyword) {
    case '가상자산':
    case '가상화폐':
    case '리플':
    case '블록체인':
    case '비트코인':
    case '빗썸':
    case '알트코인':
    case '암호화폐':
    case '업비트':
    case '에어드랍':
    case '이더리움':
    case '코빗':
    case '코인거래소':
    case '코인시세':
    case '코인원':
      return 'industry'
    case '지닥':
    case '후오비':
      return 'exchange'
    case '라인링크':
    case '루나':
    case '리브라':
    case '캐리 프로토콜':
    case '캐리프로토콜':
    case '클레이튼':
    case '테라':
    case '펀디엑스':
    case '펀디x':
    case '펀디X':
      return 'competition'
    case '페이코인':
    case '페이프로토콜':
    case '페이 프로토콜':
      return 'paycoin'
    case '네이버페이':
    case '카카오페이':
    case '삼성페이':
      return 'easy'
    default:
      return 'no_type'
  }
}

const computeChannel = (site, _index) => {
  switch (_index) {
    case 'paycoin_raw':
      return getPaycoinChannel(site)
    case 'nii_raw':
      return getNiiChannel(site)
    default:
      return 'default'
  }
}
const getNiiChannel = site => {
  switch (site) {
    case 'naverCafe':
    case 'naverPost':
    case 'daumCafe':
      return 'portal_service'
    case 'daumTistory':
    case 'naverBlog':
    case 'daumBlog':
      return 'blog'
    case 'instagram':
      return 'sns'
  }
}
const getPaycoinChannel = site => {
  switch (site) {
    case 'instagram':
    case 'twitter':
    case 'youtube':
      return 'sns'
    case 'daumBlog':
    case 'daumBrunch':
    case 'daumTistory':
    case 'naverBlog':
      return 'blog'
    case 'daumCafe':
    case 'daumTip':
    case 'natePann':
    case 'naverCafe':
    case 'naverKin':
    case 'naverPost':
      return 'portal_service'
    case 'clien':
    case 'cobak':
    case 'coinpan':
    case 'ddengle':
    case 'mlbpark':
    case 'moneynet':
    case 'ppomppu':
      return 'coin_community'
    case 'daumNews':
    case 'naverNews':
      return 'news'
    default:
      return 'normal_community'
  }
}

module.exports = { computeCategory, computeChannel }
