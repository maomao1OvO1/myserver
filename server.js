// 引入 Express（创建服务器）和 fs（读写文件）
const express = require("express");
const fs = require("fs");


// 创建服务器
const app = express();

// 记录玩家最后一次加分时间
let lastWinTime = {};

// 允许网页访问服务器接口
app.use((req,res,next)=>{

    res.header("Access-Control-Allow-Origin","*");

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    next();

});

// 允许服务器接收 JSON 数据
app.use(express.json());


// 读取排行榜数据文件
let scores = JSON.parse(
    fs.readFileSync("scores.json")
);


// 测试接口
// 访问 http://localhost:3000
// 返回服务器状态
app.get("/", (req,res)=>{

    res.send("毛毛的排行榜服务器😋");

});


// 提供排行榜网页
// 访问 http://localhost:3000/ranking.html
app.get("/ranking.html",(req,res)=>{

    res.sendFile(__dirname + "/ranking.html");

});


// 获取排行榜数据接口
// 网页通过这里获取玩家分数
app.get("/ranking",(req,res)=>{


    // 复制一份数据，避免直接修改原数据
    let ranking = [...scores];


    // 按分数从高到低排序
    ranking.sort((a,b)=>{

        return b.score - a.score;

    });


    // 返回 JSON 数据
    res.json(ranking);

});


// 临时清空排行榜
app.post("/reset",(req,res)=>{

    scores = [];

    fs.writeFileSync(
        "scores.json",
        JSON.stringify(scores,null,2)
    );

    res.json({
        success:true
    });

});


// 玩家胜利加分接口
// 游戏结束时调用
// 例如：
// {
//   name:"毛毛",
//   game:"五子棋"
// }
app.post("/win",(req,res)=>{


    // 获取游戏发送来的玩家信息
    let data = req.body;

    // 防止短时间重复刷分
let now = Date.now();

if(lastWinTime[data.name] && now - lastWinTime[data.name] < 3000){

    return res.json({

        success:false,

        message:"操作太快"

    });

}


lastWinTime[data.name] = now;

console.log(data.name,
 lastWinTime[data.name]);

    // 查找玩家是否已经存在
    let player = scores.find(

        s => s.name === data.name && s.game === data.game

    );


    // 如果玩家存在，积分 +1
    if(player){

        player.score++;

    }

    // 如果玩家不存在，创建新玩家
    else{

        scores.push({

            name:data.name,

            game:data.game,

            score:1

        });

    }


    // 保存最新排行榜数据
    fs.writeFileSync(

        "scores.json",

        JSON.stringify(scores,null,2)

    );


    // 返回成功信息
    res.json({

        success:true

    });


});


// 启动服务器
// 端口：3000
app.listen(process.env.PORT || 3000,()=>{

    console.log("服务器启动成功");

});
