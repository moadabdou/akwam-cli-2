#!/usr/bin/env node

const { prompt }                  = require("inquirer"),
      { startCase, isEmpty}       = require("lodash"),
      downloadFileWithProgressbar = require("download-file-with-progressbar"),
      { SingleBar, Presets }      = require("cli-progress"),
      { cyan, green, yellow }     = require("colors"),
      https                       = require("https"),
      {parse}                      = require("node-html-parser"),
      { existsSync, mkdirSync }   = require("fs")
    
//host of akwam site
const akwam  = 'old.akwam.co'

//title input for search
let title = {
    type: "input",
    name: "title",
    message: startCase("what do you search for") + "?",
    validate: val=> {
        if (isEmpty(val)) {
            return startCase("[!] please type something to start searching");
        } 
        return true;
    },
    filter: c => {
        return c.trim();
    }
}

//output path for save the file
let outputPath = {
    type: "input",
    name: "outputPath",
    default: "./",
    message: startCase("where you want to save the download file ") + "?",
}

//ask for answers 
function main(){
    prompt(title).then(
        //handle the answers
        ({title}) => getSearchResults(title, 
                //if there a result will download it 
                results=>{
                    console.log(cyan('[+] '+results.length+' results found'))
                    //list of results
                    let list = {
                        type: "list",
                        name: "exact",
                        choices: results,
                        message: startCase("Choose one from this list"),//list of results
                        filter: c=> {
                            return results.find(el=> el.name === c);
                        }
                    }
                    //ask for chose some item
                    prompt(list).then(
                            //lets download it
                            ({exact})=> downloadFile(exact)
                        )
                }
            )
        )  
}
main()
//get results from akwam
function getSearchResults(word, ob){
    // make a http request using GET
    https.get({
        host : akwam , 
        path : `/search/${encodeURI(word)}`
    } , response=> {
        //join all recieved data here 
        let data =  ""
        //listen for new data 
        response.on("data" , chunk=> {
            //join new data 
            data += chunk.toString()
        })
        //listen for the  request end 
        response.on("end" , ()=>{
            //parse html from the data
            let root = parse(data)
            //handel the search results 
            let matches = Array.from(
                root.querySelectorAll(".tags_box"),
                element=> {
                    //get just data what we want 
                    return {
                        href: element.querySelector("a").getAttribute("href"),
                        name: element.querySelector("h1").innerText.trim(),
                    }
                }
            )
            //the matches from html
            if (isEmpty(matches)){
                //this main no results found
                console.log(yellow('[!] sorry :( no results for : '+word))
                main()
            }else ob(matches) //start handel the found results
        })
    })
}

function downloadFile(file){
    https.get( file.href, (response)=> {
        //join all recieved data here 
        let data =  ""
        //listen for new data 
        response.on("data" , (chunk)=> {
            //join new data 
            data += chunk.toString()
        })
        //listen for the  request end 
        response.on("end" , ()=>{
            //parse html from the data
            let root = parse(data)
            //handel the file info
            let infos = {
                size : root.querySelector('.sub_file_title i').innerText, 
                downloadLink :  root.querySelector('.download_btn').getAttribute('href')
            }
            console.log(green(`
                file size : ${infos.size} 
                file name : ${file.name}
            `))
            //ask if the user want to doanload 
            let dwn = {
                type: "list",
                name: "dsc",
                choices: ['yes' , 'no'],
                message: startCase("[?] do you want to download ? ")//list of results
            }
            prompt(dwn).then(({dsc})=> {
                if (dsc === 'yes'){
                    prompt(outputPath).then(({outputPath})=>{
                        if (! existsSync(outputPath)){
                            mkdirSync(outputPath)
                        }
                        infos.out = outputPath    
                        prepareDownload(infos)
                    })
                }else{
                    console.log('[!] download cancled')
                    main()
                }
            })
        })
    })
}

function prepareDownload(infos){
    https.get(infos.downloadLink,{
        headers: { 
            'referer': infos.downloadLink,
            'x-requested-with': 'XMLHttpRequest'
        }
        }, res=> {
            let data = ""
            res.on("data" , chunk=> data+= chunk)
            res.on('end' , ()=> {
                infos.downloadLink = JSON.parse(data).direct_link
                startDownload(infos)
            })
        })
}

function startDownload(infos){
    //new instance from cli-progress
    const downloadProgress = new SingleBar({
        format: `${startCase("size")}: ${infos.size} |${cyan(
        "{bar}",
        )}| {percentage}% | ETA: {eta_formatted}`,
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
    }, Presets.shades_classic);
    //set the start and end value for progress
    downloadProgress.start(100, 0);

    //start download file
    downloadFileWithProgressbar(infos.downloadLink, {
        dir: infos.out ,
        onDone: ()=> {
            downloadProgress.stop()
            console.log(cyan('[+] finish download'))
        },
        onError: err=> {throw err},
        onProgress: (curr, total) => {
            downloadProgress.update((curr / total) * 100);
        }
    });
}