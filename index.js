#!/usr/bin/env node

const { prompt } = require("inquirer"),
  { startCase, isEmpty, isFunction } = require("lodash"),
  downloadFileWithProgressbar = require("download-file-with-progressbar"),
  { SingleBar, Presets } = require("cli-progress"),
  { cyan, yellow } = require("colors"),
  https = require("https"),
  { parse } = require("node-html-parser"),
  { existsSync, mkdirSync } = require("fs");

//host of akwam site
const akwam = "https://old.akwam.co";

/* default options for inputs  */

//title input for search
const title = {
  type: "input",
  name: "title",
  message: startCase("what do you search for") + "?",
  validate: (val) => {
    if (isEmpty(val)) {
      return startCase("[!] please type something to start searching");
    }
    return true;
  },
  filter: (c) => {
    return c.trim();
  },
};

//output path for save the file
const outputPath = {
  type: "input",
  name: "outputPath",
  default: "./",
  message: startCase("where you want to save the download file ") + "?",
};

//options message for multi downloads
const message = `
  [-] choose what you want to download
    + [space] for choose 
    + [inter] for start downmload choices
  [!] if you choose nothing will cancel download automatic
  `
/* helpers  */

//make a list of choices
function List(choices, msg, ob) {
  //default list form
  let list = {
    type: "list",
    name: "exact",
    choices,
    message: startCase(msg), //list of results
    filter: (c) => {
      return choices.find((el) => el.name === c);
    },
  };

  //ask for chose some item and excute callback
  prompt(list).then(ob);
}

//get all links from the html
function getLinks(html) {
  let links = parse(html).querySelectorAll("span.sub_file_title");
  return links.map((i) => {
    return {
      name: i.innerText,
      size: i.querySelector("i").innerText,
      downloadLink: i.parentNode.querySelector("a").getAttribute("href"),
    };
  });
}

//make an https request
function req(url, options, ob) {
  if (isFunction(options)) {
    (ob = options), (options = {});
  }
  https.get(url, options, (response) => {
    //join all recieved data here
    let data = "";
    //listen for new data
    response.on("data", (chunk) => {
      //join new data
      data += chunk.toString();
    });
    //listen for the  request end to use data
    response.on("end", () => ob(data));
  }).on('error', err=> {
    console.log("[x] please check your connection")
    throw err 
  });
}

//cancel download  function 
function cancel(){
  console.log('[x] download canceled')
  main()
}


/* main functions */

//ask for search words
function main() {
  prompt(title).then(
    //handle the answers
    ({ title }) =>
      getSearchResults(
        title,
        //if there a result will download it
        (results) => {
          console.log(cyan("[+] " + results.length + " results found"));
          //list of results
          List(results, "chose your file :  ", ({ exact }) => {
            if (exact.name.match(/مسلسل/gi)) getAllFiles(exact);
            else getFileQualties(exact);
          });
        }
      )
  );
}
main();

/* fetchers and handling data  */

//get results from akwam
function getSearchResults(word, ob) {
  // make a http request using GET
  req(akwam + "/search/" + encodeURI(word), (data) => {
    //parse html from the data
    let root = parse(data);
    //handel the search results
    let matches = Array.from(root.querySelectorAll(".tags_box"), (element) => {
      //get just name and url
      return {
        href: element.querySelector("a").getAttribute("href"),
        name: element.querySelector("h1").innerText.trim(),
      };
    });
    //the matches from html
    if (isEmpty(matches)) {
      //this mean no results found
      console.log(yellow("[!] sorry :( no results for : " + word));
      main();
    } else ob(matches); //start handel the found results
  });
}

//get all episodes from the serie
function getAllFiles(exact) {
  console.log("[+] getting episodes ..");
  req(exact.href, (data) => {
    //file infos
    let list = getLinks(data).reverse();
    console.log("[-] " + list.length + " episodes found");
    //ask if the user want to doanload
    prompt({
      name : "ans" , 
      type : "list", 
      choices : ['all' , 'choices' , 'cancel'],
      message : "[?] do you want to download all them or choices ?",
    }).then(({ ans }) => {
        if (ans === "cancel") {
          cancel()
        } else if(ans === "all"){
          prepareDownload(list);
        }else {
          prompt({
            name : "list",
            choices : list,
            type : "checkbox" ,
            filter : (choices)=>{
              return choices.map ((c)=> {
                return list.find(el=>el.name == c)
              }) 
            },
            message
          }).then(({list})=>{
              if (isEmpty(list)) {
                cancel()
                return ;
              }
              prepareDownload(list)
          })
        }
      })
  });
}

// get all found qualities of the file
function getFileQualties(file) {
  req(file.href, (data) => {
    //all found qualities
    let qualities = getLinks(data);
    //ask if the user want to doanload
    List(
      qualities.concat({name : "cancel"}),
      "[?] what you want to download ?",
      ({ exact }) => {
        if (exact.name == "cancel") cancel()
        else prepareDownload([exact])
      }
    );
  });
}

/* download functions */

//prepare for download
/*
  -folder
  -get the exact download url
*/
function prepareDownload(filesinfos) {
  //ask for output path
  prompt(outputPath).then(async ({ outputPath }) => {
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath);
    }
    console.log('[>] start download '+filesinfos.length+' files')
    for (let i = 0; i < filesinfos.length ; i++){
      filesinfos[i].out =  outputPath
      console.log('[>] ||||   ('+(i+1)+'/'+filesinfos.length+')   ||||')
      await downloadWithExactPath(filesinfos[i])
    }
  });
}

//get exact url and download from it
function downloadWithExactPath(infos){
  return new Promise(resolve=>{
    req(
      infos.downloadLink,
      {
        headers: {
          referer: infos.downloadLink,
          "x-requested-with": "XMLHttpRequest",
        },
      },
      (data) => {
        infos.downloadLink = JSON.parse(data).direct_link;
        startDownload(infos).then(resolve);
      }
    );
  })
}

//the downloader of files
function startDownload(infos) {
  console.log(`
    [-] start downloand 
    => ${infos.name}
  `)
  //new instance from cli-progress
  const downloadProgress = new SingleBar(
    {
      format: `${startCase("size")}: ${infos.size} |${cyan(
        "{bar}"
      )}| {percentage}% | ETA: {eta_formatted}`,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    Presets.shades_classic
  );
  //set the start and end value for progress
  downloadProgress.start(100, 0);
  downloadProgress.u
  return new Promise(resolve=>{
      //start download file
    downloadFileWithProgressbar(infos.downloadLink, {
      dir: infos.out,
      onDone: () => {
        downloadProgress.stop();
        console.log(cyan(`
      [+] finish download
      => ${infos.name}`));
        resolve()
      },
      onError: (err) => {
        throw err;
      },
      onProgress: (curr, total) => {
        downloadProgress.update((curr / total) * 100);
      },
    });
  })
}
