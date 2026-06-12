const BASE_URL = "https://www.aladin.co.kr/ttb/api";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function buildUrl(endpoint, params) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const apiKey = process.env.ALADIN_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "ALADIN_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  const params = event.queryStringParameters || {};
  const action = params.action;

  const common = {
    ttbkey: apiKey,
    output: "js",
    Version: "20131101",
    Cover: "Big",
    SearchTarget: "Book",
  };

  let apiUrl;

  try {
    switch (action) {
      case "search":
        apiUrl = buildUrl("ItemSearch.aspx", {
          ...common,
          Query: params.query,
          QueryType: params.queryType || "Keyword",
          MaxResults: params.maxResults || "30",
          start: params.start || "1",
        });
        break;

      case "bestseller":
        apiUrl = buildUrl("ItemList.aspx", {
          ...common,
          QueryType: "Bestseller",
          MaxResults: params.maxResults || "20",
          start: params.start || "1",
        });
        break;

      case "lookup":
        apiUrl = buildUrl("ItemLookUp.aspx", {
          ...common,
          ItemId: params.itemId,
          itemIdType: "ItemId",
          OptResult: "fulldescription,categoryIdList",
        });
        break;

      default:
        return jsonResponse(400, { error: "action 파라미터가 필요합니다. (search, bestseller, lookup)" });
    }

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.errorCode) {
      return jsonResponse(400, data);
    }

    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, { error: error.message || "API 요청 중 오류가 발생했습니다." });
  }
};
